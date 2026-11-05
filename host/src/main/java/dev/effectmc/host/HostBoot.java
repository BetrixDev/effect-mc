package dev.effectmc.host;

import dev.effectmc.host.container.Container;
import dev.effectmc.host.container.ContainerDiscovery;
import dev.effectmc.host.container.ContainerFailure;
import dev.effectmc.host.container.DiscoveryResult;
import dev.effectmc.host.runtime.HostClassAllowList;
import dev.effectmc.host.runtime.HostEngine;
import dev.effectmc.host.runtime.PluginRuntime;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Starts the host: verify the JDK, create the one Graal engine, discover the
 * loose containers under {@code plugins/EffectMC/}, and give each its own
 * runtime. A bad container is reported and skipped.
 */
public final class HostBoot implements AutoCloseable {

    private final Path pluginsDirectory;
    private final Logger logger;
    private final List<PluginRuntime> runtimes = new ArrayList<>();

    private HostEngine engine;

    public HostBoot(Path pluginsDirectory, Logger logger) {
        this.pluginsDirectory = pluginsDirectory;
        this.logger = logger;
    }

    public void start() {
        HostRequirements.verify(logger);

        engine = HostEngine.create(HostClassAllowList.load(), logger);

        ContainerDiscovery discovery = new ContainerDiscovery(pluginsDirectory);
        DiscoveryResult result = discovery.discover();

        for (ContainerFailure failure : result.failures()) {
            logger.warning(() -> "Skipped container at " + failure.path() + ": " + failure.message());
        }

        if (result.containers().isEmpty()) {
            logger.info(() -> "No containers found under " + discovery.containerRoot());
            return;
        }

        for (Container container : result.containers()) {
            PluginRuntime runtime = new PluginRuntime(container, engine, logger::info, logger);
            try {
                runtime.start();
                runtimes.add(runtime);
            } catch (Exception e) {
                runtime.close();
                logger.log(Level.SEVERE,
                        "Failed to load container '" + container.name() + "' from " + container.moduleName(), e);
            }
        }

        logger.info(() -> "EffectMC host loaded " + runtimes.size() + " of "
                + result.containers().size() + " container(s).");
    }

    public List<String> loadedContainers() {
        return runtimes.stream().map(PluginRuntime::name).toList();
    }

    @Override
    public void close() {
        for (int index = runtimes.size() - 1; index >= 0; index--) {
            runtimes.get(index).close();
        }
        runtimes.clear();

        if (engine != null) {
            engine.close();
            engine = null;
        }
    }
}
