package dev.effectmc.host.container;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

/**
 * The validated contents of a container's {@code plugin.json}.
 *
 * <p>Paper validates nothing in this directory, so the host is responsible for
 * shape errors and for the version information it later reports at boot.
 */
public record ContainerManifest(String name, String version, String entry) {

    public static final String FILE_NAME = "plugin.json";
    public static final String DEFAULT_ENTRY = "plugin.mjs";

    private static final Pattern NAME = Pattern.compile("[a-z0-9][a-z0-9_-]{0,63}");
    private static final Pattern VERSION = Pattern.compile("[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}");
    private static final Pattern ENTRY = Pattern.compile("[A-Za-z0-9._-]{1,128}");

    /** Reads and validates {@code plugin.json} inside a loose container directory. */
    public static ContainerManifest read(Path directory) throws ContainerException {
        ContainerManifest manifest = readSource(directory);
        Path directoryName = directory.getFileName();
        if (directoryName == null) {
            return manifest;
        }
        return requireName(manifest, directoryName.toString(), "directory name '" + directoryName + "'");
    }

    /**
     * Reads and validates a build source directory. Unlike a deployed loose
     * container, a build source directory does not have to be named after the
     * manifest; the output jar is named from the manifest.
     */
    static ContainerManifest readForPacking(Path directory) throws ContainerException {
        return readSource(directory);
    }

    private static ContainerManifest readSource(Path directory) throws ContainerException {
        Path manifestPath = directory.resolve(FILE_NAME);
        if (!Files.isRegularFile(manifestPath)) {
            throw new ContainerException("Missing " + FILE_NAME + " in " + directory);
        }

        String json;
        try {
            json = Files.readString(manifestPath, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ContainerException("Could not read " + manifestPath + ": " + e.getMessage(), e);
        }

        return parse(json, directory.toString());
    }

    /**
     * Validates manifest text read from any container shape.
     *
     * @param origin the directory or jar the manifest came from, for messages
     */
    static ContainerManifest parse(String json, String origin) throws ContainerException {
        JsonObject object;
        try {
            JsonElement element = JsonParser.parseString(json);
            if (!element.isJsonObject()) {
                throw new ContainerException(FILE_NAME + " in " + origin + " must contain a JSON object");
            }
            object = element.getAsJsonObject();
        } catch (JsonParseException e) {
            throw new ContainerException("Malformed " + FILE_NAME + " in " + origin + ": " + e.getMessage(), e);
        }

        String name = requiredString(object, "name", origin);
        String version = requiredString(object, "version", origin);
        String entry = optionalString(object, "entry", origin, DEFAULT_ENTRY);

        if (!NAME.matcher(name).matches()) {
            throw new ContainerException(
                    "Invalid container name '" + name + "' in " + origin
                            + ": use lowercase letters, digits, '-' or '_' (maximum 64 characters)");
        }
        if (!VERSION.matcher(version).matches()) {
            throw new ContainerException(
                    "Invalid container version '" + version + "' in " + origin
                            + ": use letters, digits, '.', '+', '-' or '_' (maximum 64 characters)");
        }
        if (!ENTRY.matcher(entry).matches() || entry.equals(".") || entry.equals("..")) {
            throw new ContainerException(
                    "Invalid entry '" + entry + "' in " + origin
                            + ": use a plain file name inside the container");
        }
        if (entry.equals(FILE_NAME)) {
            throw new ContainerException(
                    "Invalid entry '" + entry + "' in " + origin
                            + ": the entry must be the bundled module, not the manifest");
        }

        return new ContainerManifest(name, version, entry);
    }

    /**
     * Requires a container's manifest name to match its deployed artifact name.
     *
     * @param artifactDescription the phrase after "must match its", such as
     *                            {@code directory name 'hello'} or
     *                            {@code jar file name 'hello.jar'}
     */
    static ContainerManifest requireName(
            ContainerManifest manifest, String expectedName, String artifactDescription) throws ContainerException {
        if (!expectedName.equals(manifest.name())) {
            throw new ContainerException(
                    "Container name '" + manifest.name() + "' must match its " + artifactDescription);
        }
        return manifest;
    }

    private static String requiredString(JsonObject json, String field, String origin) throws ContainerException {
        String value = optionalString(json, field, origin, null);
        if (value == null) {
            throw new ContainerException("Missing required field '" + field + "' in " + FILE_NAME + " in " + origin);
        }
        return value;
    }

    private static String optionalString(JsonObject json, String field, String origin, String fallback)
            throws ContainerException {
        JsonElement element = json.get(field);
        if (element == null || element.isJsonNull()) {
            return fallback;
        }
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            throw new ContainerException(
                    "Field '" + field + "' in " + FILE_NAME + " in " + origin + " must be a string");
        }
        String value = element.getAsString().trim();
        if (value.isEmpty()) {
            throw new ContainerException(
                    "Field '" + field + "' in " + FILE_NAME + " in " + origin + " must not be blank");
        }
        return value;
    }
}
