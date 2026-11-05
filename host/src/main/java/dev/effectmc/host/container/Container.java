package dev.effectmc.host.container;

/**
 * One author plugin artifact. A loose directory and a packed jar present the
 * same two things to the host: identity and a bundled ES module.
 */
public interface Container {

    String name();

    String version();

    String entry();

    /** The name Graal uses in stack traces and error messages. */
    String moduleName();

    /** The self-contained module source. Containers are bundled, so no imports resolve. */
    String readModule() throws ContainerException;
}
