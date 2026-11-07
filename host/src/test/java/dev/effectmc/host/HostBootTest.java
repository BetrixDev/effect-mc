package dev.effectmc.host;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HostBootTest {

    @TempDir
    Path plugins;

    @Test
    void discoversAndEvaluatesAContainerIntoTheLog() throws IOException {
        TestContainers.write(plugins, "hello", """
                console.log("console output from " + effectmc.name());
                console.warn("a warning");
                console.error("an error");
                effectmc.log("thread=" + effectmc.threadName());
                export default { name: "hello" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertEquals(java.util.List.of("hello"), boot.loadedContainers());
            assertTrue(log.joined().contains("[hello] console output from hello"), log.joined());
            assertTrue(log.contains(java.util.logging.Level.WARNING, "[hello] a warning"), log.joined());
            assertTrue(log.contains(java.util.logging.Level.SEVERE, "[hello] an error"), log.joined());
            assertTrue(log.joined().contains("[hello] thread=EffectMC-hello"), log.joined());
            assertTrue(log.contains(java.util.logging.Level.INFO, "requires Java 25"), log.joined());
        }
    }

    @Test
    void givesEveryContainerItsOwnContextAndOwnerThread() throws IOException {
        TestContainers.write(plugins, "alpha", """
                globalThis.leaked = "alpha";
                effectmc.log("thread=" + effectmc.threadName());
                export default { name: "alpha" };
                """);
        TestContainers.write(plugins, "beta", """
                effectmc.log("thread=" + effectmc.threadName());
                effectmc.log("leaked=" + globalThis.leaked);
                export default { name: "beta" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertEquals(java.util.List.of("alpha", "beta"), boot.loadedContainers());
            assertTrue(log.joined().contains("[alpha] thread=EffectMC-alpha"), log.joined());
            assertTrue(log.joined().contains("[beta] thread=EffectMC-beta"), log.joined());
            assertTrue(log.joined().contains("[beta] leaked=undefined"), log.joined());
        }
    }

    @Test
    void rejectsJavaClassLookupsOutsideTheAllowList() throws IOException {
        TestContainers.write(plugins, "lookup", """
                let allowed = "missing";
                let denied = "missing";
                try {
                  allowed = Java.type("org.bukkit.entity.Player") ? "allowed" : "missing";
                } catch (error) {
                  allowed = "error: " + error;
                }
                try {
                  Java.type("java.io.File");
                  denied = "allowed";
                } catch (error) {
                  denied = "denied";
                }
                effectmc.log("allowed=" + allowed);
                effectmc.log("denied=" + denied);
                export default { name: "lookup" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertTrue(log.joined().contains("[lookup] allowed=allowed"), log.joined());
            assertTrue(log.joined().contains("[lookup] denied=denied"), log.joined());
        }
    }

    @Test
    void skipsAContainerWhoseModuleHasNoDefaultExport() throws IOException {
        TestContainers.write(plugins, "no-default", """
                effectmc.log("evaluated but not a plugin");
                """);
        TestContainers.write(plugins, "good", """
                export default { name: "good" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertEquals(java.util.List.of("good"), boot.loadedContainers());
            assertTrue(log.contains(java.util.logging.Level.SEVERE, "must default-export a Plugin value"), log.joined());
        }
    }

    @Test
    void skipsAMalformedPackedContainerAndLoadsTheRest() throws IOException {
        TestContainers.write(plugins, "good", """
                effectmc.log("good loaded");
                export default { name: "good" };
                """);
        TestContainers.writeJar(
                plugins.resolve("EffectMC").resolve("broken.jar"),
                "{not json",
                java.util.Map.of("plugin.mjs", "export default { name: 'broken' };"));

        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertEquals(java.util.List.of("good"), boot.loadedContainers());
            assertTrue(log.contains(java.util.logging.Level.WARNING, "Malformed plugin.json"), log.joined());
            assertTrue(log.contains(java.util.logging.Level.WARNING, "broken.jar"), log.joined());
            assertTrue(log.lines().stream().noneMatch(line -> line.contains("SEVERE")), log.joined());
        }
    }
}
