package dev.effectmc.host.container;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContainerManifestTest {

    @TempDir
    Path directory;

    @Test
    void readsTheRequiredFieldsAndDefaultsTheEntry() throws IOException, ContainerException {
        Path hello = Files.createDirectories(directory.resolve("hello"));
        Files.writeString(hello.resolve("plugin.json"), """
                {
                  "name": "hello",
                  "version": "0.1.0"
                }
                """);

        ContainerManifest manifest = ContainerManifest.read(hello);

        assertEquals("hello", manifest.name());
        assertEquals("0.1.0", manifest.version());
        assertEquals("plugin.mjs", manifest.entry());
    }

    @Test
    void rejectsANameThatDoesNotMatchTheDirectory() throws IOException {
        Files.writeString(directory.resolve("plugin.json"), """
                {
                  "name": "other",
                  "version": "0.1.0"
                }
                """);

        ContainerException error = assertThrows(ContainerException.class, () -> ContainerManifest.read(directory));

        assertTrue(error.getMessage().contains("must match its directory name"));
    }

    @Test
    void rejectsAnInvalidName() throws IOException {
        Files.writeString(directory.resolve("plugin.json"), """
                {
                  "name": "Hello World",
                  "version": "0.1.0"
                }
                """);

        assertThrows(ContainerException.class, () -> ContainerManifest.read(directory));
    }

    @Test
    void rejectsMalformedJsonWithAClearMessage() throws IOException {
        Files.writeString(directory.resolve("plugin.json"), "{not json");

        ContainerException error = assertThrows(ContainerException.class, () -> ContainerManifest.read(directory));

        assertTrue(error.getMessage().startsWith("Malformed plugin.json"));
    }

    @Test
    void rejectsAMissingManifest() {
        ContainerException error = assertThrows(ContainerException.class, () -> ContainerManifest.read(directory));

        assertTrue(error.getMessage().contains("Missing plugin.json"));
    }

    @Test
    void rejectsAMissingVersion() throws IOException {
        Files.writeString(directory.resolve("plugin.json"), """
                {
                  "name": "hello"
                }
                """);

        assertThrows(ContainerException.class, () -> ContainerManifest.read(directory));
    }

    @Test
    void rejectsAnEntryThatEscapesTheContainer() throws IOException {
        Files.writeString(directory.resolve("plugin.json"), """
                {
                  "name": "%s",
                  "version": "0.1.0",
                  "entry": "../plugin.mjs"
                }
                """.formatted(directory.getFileName()));

        ContainerException error = assertThrows(ContainerException.class, () -> ContainerManifest.read(directory));

        assertTrue(error.getMessage().startsWith("Invalid entry"));
    }
}
