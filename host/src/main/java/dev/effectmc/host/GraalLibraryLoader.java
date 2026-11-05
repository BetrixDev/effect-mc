package dev.effectmc.host;

import io.papermc.paper.plugin.loader.PluginClasspathBuilder;
import io.papermc.paper.plugin.loader.PluginLoader;
import io.papermc.paper.plugin.loader.library.impl.MavenLibraryResolver;
import org.eclipse.aether.artifact.DefaultArtifact;
import org.eclipse.aether.graph.Dependency;
import org.eclipse.aether.repository.RemoteRepository;

/**
 * Puts Graal on the host's classpath without shading or relocating it.
 *
 * <p>This class runs before the plugin's own classes load, so it must only
 * reference Paper's loader API and Aether types.
 */
public final class GraalLibraryLoader implements PluginLoader {

    private static final String GRAAL_VERSION = "25.3.4.1";

    @Override
    public void classloader(PluginClasspathBuilder classpathBuilder) {
        MavenLibraryResolver resolver = new MavenLibraryResolver();
        resolver.addRepository(new RemoteRepository.Builder(
                "central-mirror", "default", MavenLibraryResolver.MAVEN_CENTRAL_DEFAULT_MIRROR).build());

        // The language coordinate is a pom aggregator; polyglot is added directly
        // because the host compiles against the SDK types.
        resolver.addDependency(graalArtifact("org.graalvm.polyglot:polyglot"));
        resolver.addDependency(graalArtifact("org.graalvm.polyglot:js:pom"));

        classpathBuilder.addLibrary(resolver);
    }

    private static Dependency graalArtifact(String coordinates) {
        return new Dependency(new DefaultArtifact(coordinates + ":" + GRAAL_VERSION), null);
    }
}
