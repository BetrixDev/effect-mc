package dev.effectmc.host.container;

import dev.effectmc.host.TestContainers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContainerDiscoveryTest {

    @TempDir
    Path plugins;

    @TempDir
    Path staging;

    @Test
    void discoversLooseContainersAndReportsBadEntries() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", "export default { name: 'alpha' };");
        TestContainers.write(plugins, "beta", "export default { name: 'beta' };");

        Path broken = Files.createDirectories(plugins.resolve("EffectMC").resolve("broken"));
        Files.writeString(broken.resolve("plugin.json"), "{\"name\":\"broken\"}");

        Files.writeString(plugins.resolve("EffectMC").resolve("not-a-container.txt"), "ignored");

        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertEquals(List.of("alpha", "beta"), result.containers().stream().map(Container::name).toList());
        assertEquals(2, result.failures().size());
        assertTrue(result.containers().getFirst().readModule().contains("alpha"));
    }

    @Test
    void discoversPackedJarsAlongsideLooseDirectories() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", "export default { name: 'alpha' };");
        Path beta = TestContainers.writeContainer(
                staging.resolve("beta"), "beta", "export default { name: 'beta' };");
        ContainerPacker.pack(beta, plugins.resolve("EffectMC"));

        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertEquals(List.of("alpha", "beta"), result.containers().stream().map(Container::name).toList());
        assertTrue(result.failures().isEmpty(), result.failures().toString());
        Container packed = result.containers().get(1);
        assertEquals("beta/plugin.mjs", packed.sourceName());
        assertTrue(packed.readModule().contains("beta"));
    }

    @Test
    void rejectsADuplicateNameRatherThanLoadingItTwice() throws IOException, ContainerException {
        TestContainers.write(plugins, "hello", "export default { name: 'hello' };");
        Path source = TestContainers.writeContainer(
                staging.resolve("hello"), "hello", "export default { name: 'hello' };");
        ContainerPacker.pack(source, plugins.resolve("EffectMC"));

        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertEquals(List.of("hello"), result.containers().stream().map(Container::name).toList());
        assertEquals(1, result.failures().size());
        assertTrue(result.failures().getFirst().message().contains("Duplicate container name 'hello'"),
                result.failures().getFirst().message());
    }

    @Test
    void reportsAMalformedPackedManifestWithoutHidingGoodContainers() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", "export default { name: 'alpha' };");
        TestContainers.writeJar(
                plugins.resolve("EffectMC").resolve("broken.jar"),
                "{not json",
                java.util.Map.of("plugin.mjs", "export default { name: 'broken' };"));

        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertEquals(List.of("alpha"), result.containers().stream().map(Container::name).toList());
        assertEquals(1, result.failures().size());
        assertTrue(result.failures().getFirst().message().startsWith("Malformed plugin.json"),
                result.failures().getFirst().message());
    }

    @Test
    void returnsEmptyWhenTheContainerDirectoryDoesNotExist() {
        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertTrue(result.containers().isEmpty());
        assertTrue(result.failures().isEmpty());
    }
}
