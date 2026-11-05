package dev.effectmc.host.container;

/** A container could not be discovered, read, or validated. */
public final class ContainerException extends Exception {

    public ContainerException(String message) {
        super(message);
    }

    public ContainerException(String message, Throwable cause) {
        super(message, cause);
    }
}
