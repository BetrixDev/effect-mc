package dev.effectmc.host;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.tree.LiteralCommandNode;
import dev.effectmc.host.container.ContainerException;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import net.kyori.adventure.text.Component;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;
import java.util.logging.Level;

/** The only Paper plugin EffectMC installs. */
public final class EffectMcHostPlugin extends JavaPlugin {

    /** Admin-only: a reload rebuilds a live plugin's Context. */
    private static final String RELOAD_PERMISSION = "effectmc.reload";

    private static final String COMMAND_DESCRIPTION =
            "EffectMC host commands. Reload is a caveated Context rebuild, not hot module reload.";

    private HostBoot boot;

    @Override
    public void onEnable() {
        boot = new HostBoot(getServer().getPluginsFolder().toPath(), getLogger());
        try {
            boot.start();
        } catch (Exception | LinkageError | StackOverflowError error) {
            getLogger().log(Level.SEVERE, "EffectMC host failed to start", error);
            boot.close();
            boot = null;
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event ->
                event.registrar().register(command(), COMMAND_DESCRIPTION, List.of()));
    }

    @Override
    public void onDisable() {
        if (boot != null) {
            boot.close();
            boot = null;
        }
    }

    private LiteralCommandNode<CommandSourceStack> command() {
        return Commands.literal("effectmc")
                .requires(source -> source.getSender().hasPermission(RELOAD_PERMISSION))
                .then(reloadCommand())
                .executes(context -> {
                    context.getSource().getSender().sendMessage(Component.text(
                            "Usage: /effectmc reload <name> — this is a caveated Context rebuild, "
                                    + "not hot module reload."));
                    return 1;
                })
                .build();
    }

    private LiteralArgumentBuilder<CommandSourceStack> reloadCommand() {
        return Commands.literal("reload")
                .then(Commands.argument("name", StringArgumentType.word())
                        .suggests((context, builder) -> {
                            if (boot != null) {
                                for (String name : boot.loadedContainers()) {
                                    builder.suggest(name);
                                }
                            }
                            return builder.buildFuture();
                        })
                        .executes(context ->
                                reload(context, StringArgumentType.getString(context, "name"))));
    }

    private int reload(CommandContext<CommandSourceStack> context, String name) {
        CommandSender sender = context.getSource().getSender();
        if (boot == null) {
            sender.sendMessage(Component.text("EffectMC host is not running."));
            return 0;
        }

        try {
            boot.reload(name);
            sender.sendMessage(Component.text(
                    "Reloaded '" + name + "'. This was a caveated Context rebuild, "
                            + "not hot module reload."));
            return 1;
        } catch (ContainerException error) {
            sender.sendMessage(Component.text("Could not reload '" + name + "': " + error.getMessage()));
            getLogger().log(Level.WARNING, "Caveated reload of container '" + name + "' failed", error);
            return 0;
        } catch (RuntimeException | LinkageError | StackOverflowError error) {
            sender.sendMessage(Component.text("Could not reload '" + name + "': " + error));
            getLogger().log(Level.SEVERE, "Caveated reload of container '" + name + "' failed", error);
            return 0;
        }
    }
}
