package dev.effectmc.host.container;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * A packed container: one jar holding {@code plugin.json} and the bundled
 * module. It presents exactly what {@link DirectoryContainer} does, and reads
 * the archive again on every call so a replaced jar is picked up by a scoped
 * reload.
 */
public final class JarContainer implements Container {

    private static final String JAR_SUFFIX = ".jar";

    private final Path jar;
    private final ContainerManifest manifest;

    private JarContainer(Path jar, ContainerManifest manifest) {
        this.jar = jar;
        this.manifest = manifest;
    }

    /** Opens and validates a packed container's manifest. The module stays lazy. */
    public static JarContainer open(Path jar) throws ContainerException {
        Path normalized = jar.toAbsolutePath().normalize();
        if (!Files.isRegularFile(normalized)) {
            throw new ContainerException("Missing container jar " + normalized);
        }

        String fileName = normalized.getFileName().toString();
        String name = baseName(fileName);
        if (name == null) {
            throw new ContainerException("Container jar must end in " + JAR_SUFFIX + ": " + normalized);
        }

        String manifestJson = readEntry(
                normalized,
                ContainerManifest.FILE_NAME,
                "Missing " + ContainerManifest.FILE_NAME + " in container jar " + normalized);
        ContainerManifest manifest = ContainerManifest.requireName(
                ContainerManifest.parse(manifestJson, normalized.toString()),
                name,
                "jar file name '" + fileName + "'");
        return new JarContainer(normalized, manifest);
    }

    @Override
    public String name() {
        return manifest.name();
    }

    @Override
    public String version() {
        return manifest.version();
    }

    @Override
    public String entry() {
        return manifest.entry();
    }

    @Override
    public String sourceName() {
        return name() + "/" + entry();
    }

    @Override
    public String readModule() throws ContainerException {
        return readEntry(
                jar,
                entry(),
                "Missing container module " + entry() + " in container jar " + jar);
    }

    private static String readEntry(Path jar, String entryName, String missingMessage) throws ContainerException {
        try (ZipFile zip = new ZipFile(jar.toFile(), StandardCharsets.UTF_8)) {
            ZipEntry entry = zip.getEntry(entryName);
            if (entry == null || entry.isDirectory()) {
                throw new ContainerException(missingMessage);
            }
            try (InputStream stream = zip.getInputStream(entry)) {
                return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            throw new ContainerException("Could not read container jar " + jar + ": " + e.getMessage(), e);
        }
    }

    private static String baseName(String fileName) {
        if (fileName.length() <= JAR_SUFFIX.length()
                || !fileName.toLowerCase(Locale.ROOT).endsWith(JAR_SUFFIX)) {
            return null;
        }
        return fileName.substring(0, fileName.length() - JAR_SUFFIX.length());
    }
}
