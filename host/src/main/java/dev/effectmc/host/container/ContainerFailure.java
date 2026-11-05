package dev.effectmc.host.container;

/** One container that discovery could not accept. One bad container must not hide the others. */
public record ContainerFailure(java.nio.file.Path path, String message) {}
