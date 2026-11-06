package dev.effectmc.host;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Handler;
import java.util.logging.Level;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

final class RecordingLog {

    private final List<String> lines = new CopyOnWriteArrayList<>();
    private final Logger logger = Logger.getAnonymousLogger();

    RecordingLog() {
        logger.setUseParentHandlers(false);
        logger.addHandler(new Handler() {
            @Override
            public void publish(LogRecord record) {
                String message = record.getMessage();
                if (record.getParameters() != null) {
                    message = java.text.MessageFormat.format(message, record.getParameters());
                }
                if (record.getThrown() != null) {
                    message += " :: " + record.getThrown();
                }
                lines.add(record.getLevel() + " " + message);
            }

            @Override
            public void flush() {}

            @Override
            public void close() {}
        });
    }

    Logger logger() {
        return logger;
    }

    List<String> lines() {
        return List.copyOf(lines);
    }

    String joined() {
        return String.join("\n", lines);
    }

    boolean contains(Level level, String fragment) {
        return lines.stream().anyMatch(line -> line.startsWith(level.getName()) && line.contains(fragment));
    }
}
