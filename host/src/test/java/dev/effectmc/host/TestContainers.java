package dev.effectmc.host;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Writes loose and packed containers into test directories. */
public final class TestContainers {

    private TestContainers() {}

    /** Writes a loose container at {@code plugins/EffectMC/<name>/}. */
    public static Path write(Path plugins, String name, String module) throws IOException {
        return writeContainer(plugins.resolve("EffectMC").resolve(name), name, module);
    }

    /** Writes a loose container into exactly {@code directory}. */
    public static Path writeContainer(Path directory, String name, String module) throws IOException {
        Files.createDirectories(directory);
        Files.writeString(directory.resolve("plugin.json"), manifest(name));
        Files.writeString(directory.resolve("plugin.mjs"), module);
        return directory;
    }

    public static String manifest(String name) {
        return """
                {
                  "name": "%s",
                  "version": "0.1.0",
                  "entry": "plugin.mjs"
                }
                """.formatted(name);
    }

    /**
     * Writes a jar with the given entries. A {@code null} manifest omits
     * {@code plugin.json}, which lets a test build a malformed archive.
     */
    public static Path writeJar(Path jar, String manifest, Map<String, String> entries) throws IOException {
        Path parent = jar.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(jar), StandardCharsets.UTF_8)) {
            if (manifest != null) {
                writeEntry(zip, "plugin.json", manifest);
            }
            for (Map.Entry<String, String> entry : entries.entrySet()) {
                writeEntry(zip, entry.getKey(), entry.getValue());
            }
        }
        return jar;
    }

    private static void writeEntry(ZipOutputStream zip, String name, String contents) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(contents.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
