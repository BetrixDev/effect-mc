package dev.effectmc.host.container;

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

    @Test
    void discoversLooseContainersAndReportsBadEntries() throws IOException, ContainerException {
        writeContainer("alpha", "export default { name: 'alpha' };");
        writeContainer("beta", "export default { name: 'beta' };");

        Path broken = Files.createDirectories(plugins.resolve("EffectMC").resolve("broken"));
        Files.writeString(broken.resolve("plugin.json"), "{\"name\":\"broken\"}");

        Files.writeString(plugins.resolve("EffectMC").resolve("not-a-container.txt"), "ignored");

        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertEquals(List.of("alpha", "beta"), result.containers().stream().map(Container::name).toList());
        assertEquals(2, result.failures().size());
        assertTrue(result.containers().getFirst().readModule().contains("alpha"));
    }

    @Test
    void returnsEmptyWhenTheContainerDirectoryDoesNotExist() {
        DiscoveryResult result = new ContainerDiscovery(plugins).discover();

        assertTrue(result.containers().isEmpty());
        assertTrue(result.failures().isEmpty());
    }

    private void writeContainer(String name, String module) throws IOException {
        Path directory = Files.createDirectories(plugins.resolve("EffectMC").resolve(name));
        Files.writeString(directory.resolve("plugin.json"), """
                {
                  "name": "%s",
                  "version": "0.1.0",
                  "entry": "plugin.mjs"
                }
                """.formatted(name));
        Files.writeString(directory.resolve("plugin.mjs"), module);
    }
}
