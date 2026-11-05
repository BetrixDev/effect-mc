package dev.effectmc.host.container;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Reads {@code plugins/EffectMC/*}. Packed containers arrive in a later ticket;
 * discovery already hides the shape behind {@link Container}.
 */
public final class ContainerDiscovery {

    /** The directory Paper never scans, directly under {@code plugins/}. */
    public static final String DIRECTORY_NAME = "EffectMC";

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

        for (Path candidate : candidates) {
            if (!Files.isDirectory(candidate)) {
                failures.add(new ContainerFailure(candidate, "Not a container directory"));
                continue;
            }

            try {
                ContainerManifest manifest = ContainerManifest.read(candidate);
                containers.add(new DirectoryContainer(candidate, manifest));
            } catch (ContainerException e) {
                failures.add(new ContainerFailure(candidate, e.getMessage()));
            }
        }

        containers.sort(Comparator.comparing(Container::name));
        return new DiscoveryResult(containers, failures);
    }
}
