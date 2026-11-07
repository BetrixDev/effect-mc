package dev.effectmc.host.container;

import java.nio.file.Path;

/** Command-line entry point used by the host's {@code packContainer} Gradle task. */
public final class PackContainerTool {

    private PackContainerTool() {}

    public static void main(String[] args) {
        if (args.length != 2) {
            System.err.println("Usage: PackContainerTool <container-directory> <output-directory>");
            System.exit(2);
            return;
        }

        try {
            Path jar = ContainerPacker.pack(Path.of(args[0]), Path.of(args[1]));
            System.out.println("Packed container " + jar);
        } catch (ContainerException e) {
            System.err.println("Could not pack container: " + e.getMessage());
            System.exit(1);
        }
    }
}
