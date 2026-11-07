package dev.effectmc.host;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Writes a loose container into a test plugins directory. */
final class TestContainers {

    private TestContainers() {}

    static Path write(Path plugins, String name, String module) throws IOException {
        Path directory = Files.createDirectories(plugins.resolve("EffectMC").resolve(name));
        Files.writeString(directory.resolve("plugin.json"), """
                {
                  "name": "%s",
                  "version": "0.1.0",
                  "entry": "plugin.mjs"
                }
                """.formatted(name));
        Files.writeString(directory.resolve("plugin.mjs"), module);
        return directory;
    }
}
