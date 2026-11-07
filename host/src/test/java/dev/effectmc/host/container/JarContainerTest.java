package dev.effectmc.host.container;

import dev.effectmc.host.TestContainers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JarContainerTest {

    private static final String MODULE = """
            effectmc.log("packed hello");
            export default { name: "hello" };
            """;

    @TempDir
    Path workspace;

    @TempDir
    Path packed;

    @Test
    void aPackedJarAndALooseDirectoryExposeTheSameContainer() throws IOException, ContainerException {
        Path directory = TestContainers.writeContainer(workspace.resolve("hello"), "hello", MODULE);
        Container loose = new DirectoryContainer(directory, ContainerManifest.read(directory));
        Container jar = JarContainer.open(ContainerPacker.pack(directory, packed));

        assertEquals(loose.name(), jar.name());
        assertEquals(loose.version(), jar.version());
        assertEquals(loose.entry(), jar.entry());
        assertEquals(loose.sourceName(), jar.sourceName());
        assertEquals(loose.readModule(), jar.readModule());
    }

    @Test
    void aJarWhoseNameDoesNotMatchItsManifestFailsClearly() throws IOException, ContainerException {
        Path directory = TestContainers.writeContainer(workspace.resolve("hello"), "hello", MODULE);
        Path jar = ContainerPacker.pack(directory, packed);
        Path renamed = Files.move(jar, packed.resolve("renamed.jar"));

        ContainerException error = assertThrows(ContainerException.class, () -> JarContainer.open(renamed));

        assertTrue(error.getMessage().contains("must match its jar file name 'renamed.jar'"), error.getMessage());
    }

    @Test
    void aMissingManifestFailsClearlyWithoutAStackTrace() throws IOException {
        Path jar = TestContainers.writeJar(
                packed.resolve("hello.jar"), null, Map.of("plugin.mjs", MODULE));

        ContainerException error = assertThrows(ContainerException.class, () -> JarContainer.open(jar));

        assertTrue(error.getMessage().startsWith("Missing plugin.json"), error.getMessage());
        assertTrue(error.getMessage().contains("hello.jar"), error.getMessage());
    }

    @Test
    void aMalformedManifestFailsClearlyWithoutAStackTrace() throws IOException {
        Path jar = TestContainers.writeJar(
                packed.resolve("hello.jar"), "{not json", Map.of("plugin.mjs", MODULE));

        ContainerException error = assertThrows(ContainerException.class, () -> JarContainer.open(jar));

        assertTrue(error.getMessage().startsWith("Malformed plugin.json"), error.getMessage());
        assertTrue(error.getMessage().contains("hello.jar"), error.getMessage());
    }

    @Test
    void aCorruptArchiveFailsClearlyWithoutAStackTrace() throws IOException {
        Path jar = packed.resolve("hello.jar");
        Files.createDirectories(packed);
        Files.writeString(jar, "this is not a zip file");

        ContainerException error = assertThrows(ContainerException.class, () -> JarContainer.open(jar));

        assertTrue(error.getMessage().contains("Could not read container jar"), error.getMessage());
        assertTrue(error.getMessage().contains("hello.jar"), error.getMessage());
    }

    @Test
    void aMissingModuleFailsWhenTheModuleIsRead() throws IOException, ContainerException {
        Path jar = TestContainers.writeJar(
                packed.resolve("hello.jar"), TestContainers.manifest("hello"), Map.of());

        JarContainer container = JarContainer.open(jar);

        ContainerException error = assertThrows(ContainerException.class, container::readModule);
        assertTrue(error.getMessage().contains("Missing container module plugin.mjs"), error.getMessage());
    }

    @Test
    void readsTheArchiveAgainOnEveryCall() throws IOException, ContainerException {
        Path directory = TestContainers.writeContainer(workspace.resolve("hello"), "hello", """
                export default { name: "hello", marker: "one" };
                """);
        Path jar = ContainerPacker.pack(directory, packed);
        JarContainer container = JarContainer.open(jar);

        assertTrue(container.readModule().contains("\"one\""));

        Files.writeString(directory.resolve("plugin.mjs"), """
                export default { name: "hello", marker: "two" };
                """);
        ContainerPacker.pack(directory, packed);

        assertTrue(container.readModule().contains("\"two\""));
    }

    @Test
    void readsUtf8ModuleSources() throws IOException, ContainerException {
        Path directory = TestContainers.writeContainer(
                workspace.resolve("hello"), "hello", "export default { name: 'héllo' };");
        JarContainer container = JarContainer.open(ContainerPacker.pack(directory, packed));

        assertEquals("export default { name: 'héllo' };", container.readModule());
    }

    @Test
    void rejectsAMissingJarFile() {
        ContainerException error = assertThrows(
                ContainerException.class, () -> JarContainer.open(packed.resolve("missing.jar")));

        assertTrue(error.getMessage().contains("Missing container jar"), error.getMessage());
        assertTrue(error.getMessage().contains("missing.jar"), error.getMessage());
    }
}
