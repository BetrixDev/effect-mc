package dev.effectmc.host.runtime;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Set;

/**
 * The class-name boundary passed to {@code Context.Builder.allowHostClassLookup}.
 *
 * <p>This is the security boundary for Java interop: which classes exist for a
 * container, not which members they expose.
 */
public final class HostClassAllowList {

    public static final String RESOURCE = "allow-list.txt";

    private final Set<String> classNames;

    private HostClassAllowList(Collection<String> classNames) {
        this.classNames = Set.copyOf(classNames);
    }

    public static HostClassAllowList load() {
        InputStream stream = HostClassAllowList.class.getClassLoader().getResourceAsStream(RESOURCE);
        if (stream == null) {
            throw new IllegalStateException("Missing " + RESOURCE + " on the host classpath");
        }

        Set<String> names = new java.util.HashSet<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.isEmpty() && !trimmed.startsWith("#")) {
                    names.add(trimmed);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + RESOURCE, e);
        }

        if (names.isEmpty()) {
            throw new IllegalStateException(RESOURCE + " contains no class names");
        }
        return new HostClassAllowList(names);
    }

    public static HostClassAllowList of(Collection<String> classNames) {
        return new HostClassAllowList(classNames);
    }

    public boolean allows(String className) {
        return className != null && classNames.contains(className);
    }

    public int size() {
        return classNames.size();
    }
}
