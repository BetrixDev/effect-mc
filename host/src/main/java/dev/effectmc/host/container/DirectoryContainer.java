package dev.effectmc.host.container;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** A loose container: {@code plugin.json} plus a bundled {@code .mjs} file. */
public final class DirectoryContainer implements Container {

    private final Path directory;
    private final ContainerManifest manifest;

    public DirectoryContainer(Path directory, ContainerManifest manifest) {
        this.directory = directory.toAbsolutePath().normalize();
        this.manifest = manifest;
    }

    public Path directory() {
        return directory;
    }

    @Override
    public String name() {
        return manifest.name();
    }

    @Override
    public String version() {
        return manifest.version();
    }

    @Override
    public String entry() {
        return manifest.entry();
    }

    @Override
    public String moduleName() {
        return name() + "/" + entry();
    }

    @Override
    public String readModule() throws ContainerException {
        Path module = directory.resolve(entry()).normalize();
        if (!module.startsWith(directory)) {
            throw new ContainerException(
                    "Entry '" + entry() + "' escapes the container directory " + directory);
        }
        if (!Files.isRegularFile(module)) {
            throw new ContainerException("Missing container module " + module);
        }
        try {
            return Files.readString(module, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ContainerException("Could not read container module " + module + ": " + e.getMessage(), e);
        }
    }
}
