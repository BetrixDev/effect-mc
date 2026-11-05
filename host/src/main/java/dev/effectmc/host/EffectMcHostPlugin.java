package dev.effectmc.host;

import org.bukkit.plugin.java.JavaPlugin;

import java.util.logging.Level;

/** The only Paper plugin EffectMC installs. */
public final class EffectMcHostPlugin extends JavaPlugin {

    private HostBoot boot;

    @Override
    public void onEnable() {
        boot = new HostBoot(getServer().getPluginsFolder().toPath(), getLogger());
        try {
            boot.start();
        } catch (RuntimeException e) {
            getLogger().log(Level.SEVERE, "EffectMC host failed to start", e);
            boot.close();
            boot = null;
            getServer().getPluginManager().disablePlugin(this);
        }
    }

    @Override
    public void onDisable() {
        if (boot != null) {
            boot.close();
            boot = null;
        }
    }
}
