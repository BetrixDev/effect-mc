package dev.effectmc.host.container;

import java.util.List;

/** The containers that were accepted and the entries that were rejected. */
public record DiscoveryResult(List<Container> containers, List<ContainerFailure> failures) {

    public DiscoveryResult {
        containers = List.copyOf(containers);
        failures = List.copyOf(failures);
    }
}
