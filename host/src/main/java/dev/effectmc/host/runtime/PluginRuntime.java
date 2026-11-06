package dev.effectmc.host.runtime;

import dev.effectmc.host.container.Container;
import dev.effectmc.host.container.ContainerException;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.Value;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * One container's evaluated module. Everything that touches its Context runs on
 * the single owner thread created here, so two containers can never enter each
 * other's JavaScript.
 */
public final class PluginRuntime implements AutoCloseable {

    private static final long START_TIMEOUT_SECONDS = 30;
    private static final long SHUTDOWN_TIMEOUT_SECONDS = 5;

    private final Container container;
    private final HostEngine engine;
    private final Logger logger;
    private final ExecutorService executor;
    private final AtomicReference<Thread> owner = new AtomicReference<>();
    private final AtomicBoolean started = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();

    private volatile Context context;

    public PluginRuntime(Container container, HostEngine engine, Logger logger) {
        this.container = container;
        this.engine = engine;
        this.logger = logger;
        this.executor = Executors.newSingleThreadExecutor(task -> {
            Thread thread = new Thread(task, "EffectMC-" + container.name());
            thread.setDaemon(true);
            thread.setUncaughtExceptionHandler((failed, error) ->
                    logger.log(Level.SEVERE, "Uncaught error on " + failed.getName(), error));
            owner.set(thread);
            return thread;
        });
    }

    public String name() {
        return container.name();
    }

    public void start() throws ContainerException {
        if (!started.compareAndSet(false, true)) {
            throw new IllegalStateException("Container '" + name() + "' was already started");
        }
        callOnOwnerThread(() -> {
            startOnOwnerThread();
            return null;
        });
    }

    private void startOnOwnerThread() throws ContainerException {
        if (Thread.currentThread() != owner.get()) {
            throw new IllegalStateException("Container '" + name() + "' is not on its owner thread");
        }

        HostConsole console = new HostConsole(container.name(), logger);
        context = engine.newContext(console);

        Source source;
        try {
            source = Source.newBuilder("js", container.readModule(), container.sourceName())
                    .mimeType("application/javascript+module")
                    .build();
        } catch (java.io.IOException e) {
            throw new ContainerException(
                    "Could not prepare module " + container.sourceName() + ": " + e.getMessage(), e);
        }

        Value exports = context.eval(source);
        if (exports == null || !exports.hasMember("default")) {
            throw new ContainerException(
                    "Container '" + name() + "' (" + container.sourceName()
                            + ") must default-export a Plugin value");
        }

        logger.info(() -> "Loaded container '" + container.name() + "' " + container.version()
                + " on " + Thread.currentThread().getName());
    }

    private <T> T callOnOwnerThread(Callable<T> task) throws ContainerException {
        Future<T> future;
        try {
            future = executor.submit(task);
        } catch (RejectedExecutionException e) {
            throw new ContainerException("Container '" + name() + "' is already closed", e);
        }

        try {
            return future.get(START_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            closeContextAfterTimeout();
            future.cancel(true);
            throw new ContainerException(
                    "Container '" + name() + "' did not finish within " + START_TIMEOUT_SECONDS + " seconds", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ContainerException("Interrupted while waiting for container '" + name() + "'", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof ContainerException containerException) {
                throw containerException;
            }
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            if (cause instanceof Error error) {
                throw error;
            }
            throw new ContainerException("Container '" + name() + "' failed: " + cause, cause);
        }
    }

    /**
     * Cancels a container that overran its start budget. {@code close(true)} is
     * the one Context operation that is legal from another thread while code is
     * running.
     */
    private void closeContextAfterTimeout() {
        Context current = context;
        context = null;
        if (current != null) {
            try {
                current.close(true);
            } catch (RuntimeException e) {
                logger.log(Level.WARNING, "Could not cancel container '" + name() + "'", e);
            }
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }

        if (started.get() && !executor.isShutdown()) {
            try {
                if (Thread.currentThread() == owner.get()) {
                    closeContextOnOwnerThread();
                } else {
                    callOnOwnerThread(() -> {
                        closeContextOnOwnerThread();
                        return null;
                    });
                }
            } catch (ContainerException | RuntimeException e) {
                logger.log(Level.WARNING, "Could not close container '" + name() + "' cleanly", e);
            }
        }

        executor.shutdown();
        try {
            if (!executor.awaitTermination(SHUTDOWN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                logger.warning("Container '" + name() + "' did not stop within "
                        + SHUTDOWN_TIMEOUT_SECONDS + " seconds");
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }
    }

    private void closeContextOnOwnerThread() {
        Context current = context;
        context = null;
        if (current != null) {
            current.close(true);
        }
    }
}
