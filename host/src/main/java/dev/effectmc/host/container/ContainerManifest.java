package dev.effectmc.host.container;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.io.Reader;
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

    public static ContainerManifest read(Path directory) throws ContainerException {
        Path manifestPath = directory.resolve(FILE_NAME);
        if (!Files.isRegularFile(manifestPath)) {
            throw new ContainerException("Missing " + FILE_NAME + " in " + directory);
        }

        JsonObject json;
        try (Reader reader = Files.newBufferedReader(manifestPath, StandardCharsets.UTF_8)) {
            JsonElement element = JsonParser.parseReader(reader);
            if (!element.isJsonObject()) {
                throw new ContainerException(FILE_NAME + " in " + directory + " must contain a JSON object");
            }
            json = element.getAsJsonObject();
        } catch (JsonParseException e) {
            throw new ContainerException("Malformed " + FILE_NAME + " in " + directory + ": " + e.getMessage(), e);
        } catch (IOException e) {
            throw new ContainerException("Could not read " + manifestPath + ": " + e.getMessage(), e);
        }

        String name = requiredString(json, "name", directory);
        String version = requiredString(json, "version", directory);
        String entry = optionalString(json, "entry", directory, DEFAULT_ENTRY);

        if (!NAME.matcher(name).matches()) {
            throw new ContainerException(
                    "Invalid container name '" + name + "' in " + manifestPath
                            + ": use lowercase letters, digits, '-' or '_' (maximum 64 characters)");
        }
        if (!VERSION.matcher(version).matches()) {
            throw new ContainerException(
                    "Invalid container version '" + version + "' in " + manifestPath
                            + ": use letters, digits, '.', '+', '-' or '_' (maximum 64 characters)");
        }

        Path directoryName = directory.getFileName();
        if (directoryName != null && !directoryName.toString().equals(name)) {
            throw new ContainerException(
                    "Container name '" + name + "' in " + manifestPath
                            + " must match its directory name '" + directoryName + "'");
        }

        return new ContainerManifest(name, version, entry);
    }

    private static String requiredString(JsonObject json, String field, Path directory) throws ContainerException {
        String value = optionalString(json, field, directory, null);
        if (value == null) {
            throw new ContainerException("Missing required field '" + field + "' in " + directory.resolve(FILE_NAME));
        }
        return value;
    }

    private static String optionalString(JsonObject json, String field, Path directory, String fallback)
            throws ContainerException {
        JsonElement element = json.get(field);
        if (element == null || element.isJsonNull()) {
            return fallback;
        }
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            throw new ContainerException(
                    "Field '" + field + "' in " + directory.resolve(FILE_NAME) + " must be a string");
        }
        String value = element.getAsString().trim();
        if (value.isEmpty()) {
            throw new ContainerException(
                    "Field '" + field + "' in " + directory.resolve(FILE_NAME) + " must not be blank");
        }
        return value;
    }
}
