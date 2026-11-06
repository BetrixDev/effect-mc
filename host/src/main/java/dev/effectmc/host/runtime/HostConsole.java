package dev.effectmc.host.runtime;

import org.graalvm.polyglot.HostAccess;

import java.util.logging.Logger;

/**
 * The host object bound into a container's global scope as both {@code console}
 * and {@code effectmc}. Every call is prefixed with the container name so one
 * plugin's output is identifiable in the server log.
 */
public final class HostConsole {

    private final String name;
    private final Logger logger;

    public HostConsole(String name, Logger logger) {
        this.name = name;
        this.logger = logger;
    }

    @HostAccess.Export
    public String name() {
        return name;
    }

    @HostAccess.Export
    public String threadName() {
        return Thread.currentThread().getName();
    }

    @HostAccess.Export
    public void log(Object... arguments) {
        logger.info(message(arguments));
    }

    @HostAccess.Export
    public void info(Object... arguments) {
        logger.info(message(arguments));
    }

    @HostAccess.Export
    public void warn(Object... arguments) {
        logger.warning(message(arguments));
    }

    @HostAccess.Export
    public void error(Object... arguments) {
        logger.severe(message(arguments));
    }

    private String message(Object[] arguments) {
        StringBuilder line = new StringBuilder("[").append(name).append("] ");
        if (arguments == null || arguments.length == 0) {
            return line.toString();
        }
        for (int index = 0; index < arguments.length; index++) {
            if (index > 0) {
                line.append(' ');
            }
            line.append(arguments[index]);
        }
        return line.toString();
    }
}
