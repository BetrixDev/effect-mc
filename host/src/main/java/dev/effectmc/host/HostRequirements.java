package dev.effectmc.host;

import java.util.logging.Logger;

/** Checks the runtime assumptions that the Gradle build also enforces. */
public final class HostRequirements {

    public static final int MINIMUM_JAVA = 25;

    private HostRequirements() {}

    public static int verify(Logger logger) {
        int feature = Runtime.version().feature();
        if (feature < MINIMUM_JAVA) {
            throw new IllegalStateException(
                    "effectmc-host requires Java " + MINIMUM_JAVA + " or newer, but this server is running Java "
                            + feature + " (" + Runtime.version() + ")");
        }
        logger.info(() -> "effectmc-host requires Java " + MINIMUM_JAVA
                + "; running on Java " + feature + " (" + Runtime.version() + ").");
        return feature;
    }
}
