package dev.effectmc.host;

import dev.effectmc.host.container.ContainerException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.logging.Level;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Scoped reload is per container: rebuilding one Context must leave every other
 * container's Context, thread, and module state alone.
 */
class HostBootReloadTest {

    @TempDir
    Path plugins;

    @Test
    void reloadRebuildsOnlyTheNamedContainersContext() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", """
                globalThis.marker = "alpha-old";
                effectmc.log("alpha loaded");
                export default { name: "alpha" };
                """);
        TestContainers.write(plugins, "beta", """
                effectmc.log("beta loaded");
                export default { name: "beta" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            TestContainers.write(plugins, "alpha", """
                    effectmc.log("alpha marker=" + globalThis.marker);
                    export default { name: "alpha" };
                    """);
            boot.reload("alpha");

            assertEquals(List.of("alpha", "beta"), boot.loadedContainers());
            // A new Context means no JavaScript global survives the rebuild.
            assertTrue(log.contains(Level.INFO, "[alpha] alpha marker=undefined"), log.joined());
            assertTrue(log.contains(Level.INFO, "Reloaded container 'alpha'"), log.joined());
            assertTrue(log.contains(Level.INFO, "caveated Context rebuild"), log.joined());
            // The other container's module was not evaluated again.
            assertEquals(1, count(log, "[beta] beta loaded"), log.joined());
        }
    }

    @Test
    void survivesFiftyReloadCycles() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", """
                effectmc.log("alpha loaded");
                export default { name: "alpha" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            for (int cycle = 0; cycle < 50; cycle++) {
                boot.reload("alpha");
            }

            assertEquals(List.of("alpha"), boot.loadedContainers());
            assertEquals(51, count(log, "[alpha] alpha loaded"), log.joined());
            assertEquals(50, count(log, "Reloaded container 'alpha'"), log.joined());
        }
    }

    @Test
    void rejectsAnUnknownContainerWithItsLoadedNames() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", """
                export default { name: "alpha" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            ContainerException error = assertThrows(ContainerException.class, () -> boot.reload("ghost"));

            assertTrue(error.getMessage().contains("No container named 'ghost'"), error.getMessage());
            assertTrue(error.getMessage().contains("alpha"), error.getMessage());
        }
    }

    @Test
    void aFailedReloadStopsThatContainerAndTheNextReloadRecovers() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", """
                effectmc.log("alpha loaded");
                export default { name: "alpha" };
                """);
        TestContainers.write(plugins, "beta", """
                effectmc.log("beta loaded");
                export default { name: "beta" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            TestContainers.write(plugins, "alpha", """
                    throw new Error("boom");
                    """);
            assertThrows(RuntimeException.class, () -> boot.reload("alpha"));

            assertEquals(List.of("alpha", "beta"), boot.loadedContainers());
            assertEquals(1, count(log, "[beta] beta loaded"), log.joined());

            TestContainers.write(plugins, "alpha", """
                    effectmc.log("alpha recovered");
                    export default { name: "alpha" };
                    """);
            boot.reload("alpha");

            assertTrue(log.joined().contains("[alpha] alpha recovered"), log.joined());
            assertEquals(List.of("alpha", "beta"), boot.loadedContainers());
        }
    }

    @Test
    void aContainerWithNoDefaultExportDoesNotLeaveAHalfStartedContext() throws IOException, ContainerException {
        TestContainers.write(plugins, "alpha", """
                export default { name: "alpha" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            TestContainers.write(plugins, "alpha", """
                    effectmc.log("not a plugin");
                    """);

            assertThrows(ContainerException.class, () -> boot.reload("alpha"));

            // The half-started Context is closed, so the host still shuts down
            // cleanly and can retry the same container.
            TestContainers.write(plugins, "alpha", """
                    effectmc.log("alpha recovered");
                    export default { name: "alpha" };
                    """);
            boot.reload("alpha");
            assertTrue(log.joined().contains("[alpha] alpha recovered"), log.joined());
        }

        assertTrue(log.lines().stream().noneMatch(line -> line.contains("Could not close")), log.joined());
    }

    @Test
    void anUnreadableModuleLeavesTheRunningContextAlone() throws IOException, ContainerException {
        Path directory = TestContainers.write(plugins, "alpha", """
                effectmc.log("alpha loaded");
                export default { name: "alpha" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            Files.delete(directory.resolve("plugin.mjs"));

            ContainerException error = assertThrows(ContainerException.class, () -> boot.reload("alpha"));

            assertTrue(error.getMessage().contains("Missing container module"), error.getMessage());
            assertTrue(log.lines().stream().noneMatch(line -> line.contains("Reloaded container")), log.joined());
            assertEquals(1, count(log, "[alpha] alpha loaded"), log.joined());
            assertEquals(List.of("alpha"), boot.loadedContainers());
        }
    }

    private static long count(RecordingLog log, String fragment) {
        return log.lines().stream().filter(line -> line.contains(fragment)).count();
    }
}
