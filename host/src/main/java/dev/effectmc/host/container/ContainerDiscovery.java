package dev.effectmc.host.container;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Reads {@code plugins/EffectMC/*}. A container is either a loose directory or
 * a packed {@code <name>.jar} placed directly in that directory. Discovery
 * hides the shape behind {@link Container}, so the runtime never knows which
 * one it loaded.
 */
public final class ContainerDiscovery {

    /** The directory Paper never scans, directly under {@code plugins/}. */
    public static final String DIRECTORY_NAME = "EffectMC";

    private static final String JAR_SUFFIX = ".jar";

    private final Path containerRoot;

    public ContainerDiscovery(Path pluginsDirectory) {
        this.containerRoot = pluginsDirectory.resolve(DIRECTORY_NAME).toAbsolutePath().normalize();
    }

    public Path containerRoot() {
        return containerRoot;
    }

    public DiscoveryResult discover() {
        if (!Files.isDirectory(containerRoot)) {
            return new DiscoveryResult(List.of(), List.of());
        }

        List<Path> candidates;
        try (Stream<Path> children = Files.list(containerRoot)) {
            candidates = children.sorted(Comparator.comparing(path -> path.getFileName().toString())).toList();
        } catch (IOException e) {
            return new DiscoveryResult(
                    List.of(),
                    List.of(new ContainerFailure(containerRoot, "Could not read container directory: " + e.getMessage())));
        }

        List<Container> containers = new ArrayList<>();
        List<ContainerFailure> failures = new ArrayList<>();
        Map<String, Path> origins = new HashMap<>();

        for (Path candidate : candidates) {
            Container container;
            try {
                container = open(candidate);
            } catch (ContainerException e) {
                failures.add(new ContainerFailure(candidate, e.getMessage()));
                continue;
            } catch (RuntimeException e) {
                failures.add(new ContainerFailure(candidate, "Could not read container: " + e));
                continue;
            }

            Path previous = origins.putIfAbsent(container.name(), candidate);
            if (previous != null) {
                failures.add(new ContainerFailure(candidate,
                        "Duplicate container name '" + container.name() + "'; already provided by " + previous));
                continue;
            }
            containers.add(container);
        }

        containers.sort(Comparator.comparing(Container::name));
        return new DiscoveryResult(containers, failures);
    }

    private static Container open(Path candidate) throws ContainerException {
        if (Files.isDirectory(candidate)) {
            ContainerManifest manifest = ContainerManifest.read(candidate);
            return new DirectoryContainer(candidate, manifest);
        }
        if (Files.isRegularFile(candidate) && isJar(candidate)) {
            return JarContainer.open(candidate);
        }
        throw new ContainerException("Not a container directory or .jar file");
    }

    private static boolean isJar(Path candidate) {
        return candidate.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(JAR_SUFFIX);
    }
}
