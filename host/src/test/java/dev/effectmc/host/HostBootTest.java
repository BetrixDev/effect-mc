package dev.effectmc.host;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HostBootTest {

    @TempDir
    Path plugins;

    @Test
    void discoversAndEvaluatesAContainerIntoTheLog() throws IOException {
        writeContainer("hello", """
                console.log("console output from " + effectmc.name());
                effectmc.log("thread=" + effectmc.threadName());
                export default { name: "hello" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertEquals(java.util.List.of("hello"), boot.loadedContainers());
            assertTrue(log.joined().contains("[hello] console output from hello"), log.joined());
            assertTrue(log.joined().contains("[hello] thread=EffectMC-hello"), log.joined());
            assertTrue(log.contains(java.util.logging.Level.INFO, "requires Java 25"), log.joined());
        }
    }

    @Test
    void givesEveryContainerItsOwnContextAndOwnerThread() throws IOException {
        writeContainer("alpha", """
                globalThis.leaked = "alpha";
                effectmc.log("thread=" + effectmc.threadName());
                export default { name: "alpha" };
                """);
        writeContainer("beta", """
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
        writeContainer("lookup", """
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
        writeContainer("no-default", """
                effectmc.log("evaluated but not a plugin");
                """);
        writeContainer("good", """
                export default { name: "good" };
                """);
        RecordingLog log = new RecordingLog();

        try (HostBoot boot = new HostBoot(plugins, log.logger())) {
            boot.start();

            assertEquals(java.util.List.of("good"), boot.loadedContainers());
            assertTrue(log.contains(java.util.logging.Level.SEVERE, "must default-export a Plugin value"), log.joined());
        }
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
