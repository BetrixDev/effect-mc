package dev.effectmc.host.container;

import dev.effectmc.host.TestContainers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.zip.ZipFile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContainerPackerTest {

    @TempDir
    Path workspace;

    @TempDir
    Path output;

    @Test
    void packsTheManifestAndBundledModuleIntoNameJar() throws IOException, ContainerException {
        Path source = TestContainers.writeContainer(
                workspace.resolve("hello"), "hello", "export default { name: 'hello' };");

        Path jar = ContainerPacker.pack(source, output);

        assertEquals(output.resolve("hello.jar").toAbsolutePath().normalize(), jar);
        try (ZipFile zip = new ZipFile(jar.toFile(), StandardCharsets.UTF_8)) {
            assertEquals(
                    Set.of("plugin.json", "plugin.mjs"),
                    zip.stream().map(java.util.zip.ZipEntry::getName).collect(Collectors.toSet()));
            assertEquals(
                    TestContainers.manifest("hello"),
                    new String(zip.getInputStream(zip.getEntry("plugin.json")).readAllBytes(), StandardCharsets.UTF_8));
            assertEquals(
                    "export default { name: 'hello' };",
                    new String(zip.getInputStream(zip.getEntry("plugin.mjs")).readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    @Test
    void packsACustomEntryName() throws IOException, ContainerException {
        Path source = workspace.resolve("custom");
        Files.createDirectories(source);
        Files.writeString(source.resolve("plugin.json"), """
                {
                  "name": "custom",
                  "version": "0.1.0",
                  "entry": "entry.mjs"
                }
                """);
        Files.writeString(source.resolve("entry.mjs"), "export default { name: 'custom' };");

        Path jar = ContainerPacker.pack(source, output);

        try (ZipFile zip = new ZipFile(jar.toFile(), StandardCharsets.UTF_8)) {
            assertNotNull(zip.getEntry("entry.mjs"));
            assertNull(zip.getEntry("plugin.mjs"));
        }
    }

    @Test
    void aMalformedManifestFailsWithAClearMessageAndWritesNothing() throws IOException {
        Path source = workspace.resolve("broken");
        Files.createDirectories(source);
        Files.writeString(source.resolve("plugin.json"), "{not json");
        Files.writeString(source.resolve("plugin.mjs"), "export default {};");

        ContainerException error = assertThrows(ContainerException.class, () -> ContainerPacker.pack(source, output));

        assertTrue(error.getMessage().startsWith("Malformed plugin.json"), error.getMessage());
        assertFalse(Files.exists(output.resolve("broken.jar")));
    }

    @Test
    void aMissingModuleFailsWithAClearMessage() throws IOException {
        Path source = workspace.resolve("hello");
        Files.createDirectories(source);
        Files.writeString(source.resolve("plugin.json"), TestContainers.manifest("hello"));

        ContainerException error = assertThrows(ContainerException.class, () -> ContainerPacker.pack(source, output));

        assertTrue(error.getMessage().contains("Missing container module"), error.getMessage());
    }

    @Test
    void theJarNameAlwaysComesFromTheManifest() throws IOException, ContainerException {
        Path source = TestContainers.writeContainer(
                workspace.resolve("hello"), "hello", "export default { name: 'hello' };");

        Path jar = ContainerPacker.pack(source, output);

        assertEquals("hello.jar", jar.getFileName().toString());
    }

    @Test
    void aBuildSourceDirectoryNeedNotMatchTheContainerName() throws IOException, ContainerException {
        Path source = TestContainers.writeContainer(
                workspace.resolve("hello-container"), "hello", "export default { name: 'hello' };");

        Path jar = ContainerPacker.pack(source, output);

        assertEquals("hello.jar", jar.getFileName().toString());
    }
}
