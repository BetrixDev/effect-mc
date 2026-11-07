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
            ensureOwnerThread();
            evaluateOnOwnerThread(moduleSource());
            logger.info(() -> "Loaded container '" + container.name() + "' " + container.version()
                    + " on " + Thread.currentThread().getName());
            return null;
        });
    }

    /**
     * Rebuilds this container's Context in place: close the current Context and
     * evaluate the module again on the same owner thread. This is a caveated
     * Context rebuild, not module-level hot reload, and this container's
     * previous Context is never left alive. Other containers are untouched.
     *
     * The module is read and prepared before the old Context closes, so a
     * missing or unbuildable file leaves the running plugin alone. A module
     * that fails to evaluate or does not default-export a Plugin does stop the
     * container; reload again after fixing it.
     */
    public void reload() throws ContainerException {
        if (!started.get()) {
            throw new IllegalStateException("Container '" + name() + "' has not been started");
        }
        if (closed.get()) {
            throw new IllegalStateException("Container '" + name() + "' is already closed");
        }
        callOnOwnerThread(() -> {
            ensureOwnerThread();
            reloadOnOwnerThread();
            return null;
        });
    }

    private void reloadOnOwnerThread() throws ContainerException {
        Source source = moduleSource();
        closeContextOnOwnerThread();
        evaluateOnOwnerThread(source);
        logger.info(() -> "Reloaded container '" + container.name() + "' " + container.version()
                + " in a caveated Context rebuild (not hot module reload).");
    }

    private void ensureOwnerThread() {
        if (Thread.currentThread() != owner.get()) {
            throw new IllegalStateException("Container '" + name() + "' is not on its owner thread");
        }
    }

    /** Reads the module and builds its Source without touching the live Context. */
    private Source moduleSource() throws ContainerException {
        try {
            return Source.newBuilder("js", container.readModule(), container.sourceName())
                    .mimeType("application/javascript+module")
                    .build();
        } catch (java.io.IOException e) {
            throw new ContainerException(
                    "Could not prepare module " + container.sourceName() + ": " + e.getMessage(), e);
        }
    }

    private void evaluateOnOwnerThread(Source source) throws ContainerException {
        Context next = engine.newContext(new HostConsole(container.name(), logger));
        context = next;

        try {
            Value exports = next.eval(source);
            if (exports == null || !exports.hasMember("default")) {
                throw new ContainerException(
                        "Container '" + name() + "' (" + container.sourceName()
                                + ") must default-export a Plugin value");
            }
        } catch (RuntimeException | Error | ContainerException error) {
            // A failed evaluation must not leave a half-started Context behind.
            closeContextOnOwnerThread();
            throw error;
        }
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
