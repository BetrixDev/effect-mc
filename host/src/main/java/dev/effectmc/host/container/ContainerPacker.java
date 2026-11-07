package dev.effectmc.host.container;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Packs a loose container directory into the distribution shape: one jar with
 * {@code plugin.json} and the bundled module at its root.
 *
 * <p>This is the build-side counterpart of {@link JarContainer}. The output is
 * named from the validated manifest, so a packed jar is named
 * {@code <name>.jar} and can be dropped straight into {@code plugins/EffectMC/}.
 */
public final class ContainerPacker {

    private ContainerPacker() {}

    /**
     * Packs {@code containerDirectory} into {@code outputDirectory/<name>.jar}.
     * The manifest and module are validated before anything is written, and the
     * jar is written to a temporary file so a failed pack never leaves a
     * half-written container behind.
     *
     * @return the written jar
     */
    public static Path pack(Path containerDirectory, Path outputDirectory) throws ContainerException {
        Path source = containerDirectory.toAbsolutePath().normalize();
        ContainerManifest manifest = ContainerManifest.readForPacking(source);
        DirectoryContainer container = new DirectoryContainer(source, manifest);
        String module = container.readModule();

        byte[] manifestBytes;
        try {
            manifestBytes = Files.readAllBytes(source.resolve(ContainerManifest.FILE_NAME));
        } catch (IOException e) {
            throw new ContainerException(
                    "Could not read " + ContainerManifest.FILE_NAME + " in " + source + ": " + e.getMessage(), e);
        }

        Path output = outputDirectory.toAbsolutePath().normalize();
        Path jar = output.resolve(manifest.name() + ".jar");
        Path temporary;
        try {
            Files.createDirectories(output);
            temporary = Files.createTempFile(output, ".effectmc-", ".jar.tmp");
        } catch (IOException e) {
            throw new ContainerException("Could not create the container output directory " + output + ": "
                    + e.getMessage(), e);
        }

        boolean moved = false;
        try {
            try (OutputStream stream = Files.newOutputStream(temporary);
                    ZipOutputStream zip = new ZipOutputStream(stream, StandardCharsets.UTF_8)) {
                writeEntry(zip, ContainerManifest.FILE_NAME, manifestBytes);
                writeEntry(zip, manifest.entry(), module.getBytes(StandardCharsets.UTF_8));
            }
            replace(temporary, jar);
            moved = true;
        } catch (IOException e) {
            throw new ContainerException("Could not pack container " + source + " into " + jar + ": "
                    + e.getMessage(), e);
        } finally {
            if (!moved) {
                deleteQuietly(temporary);
            }
        }

        return jar;
    }

    private static void writeEntry(ZipOutputStream zip, String name, byte[] contents) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        entry.setTime(0L);
        zip.putNextEntry(entry);
        zip.write(contents);
        zip.closeEntry();
    }

    private static void replace(Path temporary, Path jar) throws IOException {
        try {
            Files.move(temporary, jar, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temporary, jar, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // The pack failure is the useful error; a leftover temp file is not.
        }
    }
}
