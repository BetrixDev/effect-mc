package dev.effectmc.host.runtime;

import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.EnvironmentAccess;
import org.graalvm.polyglot.HostAccess;

import java.util.logging.Logger;

/**
 * The one Graal engine shared by every container, and the factory for the
 * per-container {@link Context}s it owns. Contexts are created and used on their
 * container's owner thread only.
 */
public final class HostEngine implements AutoCloseable {

    private final Engine engine;
    private final HostClassAllowList allowList;

    private HostEngine(Engine engine, HostClassAllowList allowList) {
        this.engine = engine;
        this.allowList = allowList;
    }

    public static HostEngine create(HostClassAllowList allowList, Logger logger) {
        Engine engine = Engine.newBuilder("js")
                .option("engine.WarnInterpreterOnly", "true")
                .build();

        logger.info(() -> "Graal engine " + engine.getImplementationName()
                + " (compilation=" + engine.supportsCompilation() + "), "
                + allowList.size() + " allowed classes.");

        return new HostEngine(engine, allowList);
    }

    public Context newContext(HostConsole console) {
        Context context = Context.newBuilder("js")
                .engine(engine)
                .allowHostClassLookup(allowList::allows)
                .allowHostAccess(HostAccess.newBuilder()
                        .allowPublicAccess(true)
                        .build())
                .allowCreateThread(false)
                .allowNativeAccess(false)
                .allowEnvironmentAccess(EnvironmentAccess.NONE)
                .option("js.esm-eval-returns-exports", "true")
                .build();

        // A container may write to the server log through either familiar name.
        context.getBindings("js").putMember("console", console);
        context.getBindings("js").putMember("effectmc", console);
        return context;
    }

    @Override
    public void close() {
        engine.close();
    }
}
