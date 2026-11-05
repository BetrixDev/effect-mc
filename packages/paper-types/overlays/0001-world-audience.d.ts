/**
 * @target org.bukkit.World
 * @mode merge
 * @reason World's ForwardingAudience superinterface lives outside paper-api, so its sendMessage members are not generated.
 */
export namespace org.bukkit {
  export interface World {
    sendMessage(message: __paperExternal.net.kyori.adventure.text.Component): void;
  }
}
