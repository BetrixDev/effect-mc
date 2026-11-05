package dev.effectmc.host.runtime;

import org.graalvm.polyglot.HostAccess;

import java.util.function.Consumer;

/**
 * The host object bound into a container's global scope as both {@code console}
 * and {@code effectmc}. Every call is prefixed with the container name so one
 * plugin's output is identifiable in the server log.
 */
public final class HostConsole {

    private final String name;
    private final Consumer<String> sink;

    public HostConsole(String name, Consumer<String> sink) {
        this.name = name;
        this.sink = sink;
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
        sink.accept("[" + name + "] " + join(arguments));
    }

    @HostAccess.Export
    public void info(Object... arguments) {
        log(arguments);
    }

    @HostAccess.Export
    public void warn(Object... arguments) {
        log(arguments);
    }

    @HostAccess.Export
    public void error(Object... arguments) {
        log(arguments);
    }

    private static String join(Object[] arguments) {
        if (arguments == null || arguments.length == 0) {
            return "";
        }
        StringBuilder line = new StringBuilder();
        for (int index = 0; index < arguments.length; index++) {
            if (index > 0) {
                line.append(' ');
            }
            line.append(arguments[index]);
        }
        return line.toString();
    }
}
