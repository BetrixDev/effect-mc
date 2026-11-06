package dev.effectmc.host.runtime;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HostClassAllowListTest {

    @Test
    void generatesThePaperBoundaryFromTypings() {
        HostClassAllowList allowList = HostClassAllowList.load();

        assertTrue(allowList.allows("org.bukkit.entity.Player"));
        assertTrue(allowList.allows("org.bukkit.event.block.BlockBreakEvent"));
        assertTrue(allowList.allows("io.papermc.paper.command.brigadier.Commands"));
        assertTrue(allowList.size() > 2000);
    }

    @Test
    void excludesClassesOutsideTheGeneratedTypings() {
        HostClassAllowList allowList = HostClassAllowList.load();

        assertFalse(allowList.allows("java.io.File"));
        assertFalse(allowList.allows("java.lang.Runtime"));
        assertFalse(allowList.allows("sun.misc.Unsafe"));
        assertFalse(allowList.allows("__paperExternal.net.kyori.adventure.text.Component"));
    }

    @Test
    void matchesExactNamesOnly() {
        HostClassAllowList allowList = HostClassAllowList.of(Set.of("org.bukkit.World"));

        assertTrue(allowList.allows("org.bukkit.World"));
        assertFalse(allowList.allows("org.bukkit.WorldBorder"));
        assertFalse(allowList.allows(null));
    }
}
