import {
  type CommandNode,
  type CommandRegistrarService,
  CommandRegistrar,
} from "@effectmc/commands";
import { Layer } from "effect";

/**
 * The host stand-in for `Commands.attach`. It records the trees a plugin
 * registered so tests can assert their shape and dispatch through a node
 * without a Paper server.
 */
export interface FakeCommandRegistrar extends CommandRegistrarService {
  readonly roots: () => ReadonlyArray<CommandNode>;
  readonly clear: () => void;
}

/**
 * Registers by root label. Registering the same label again replaces the entry,
 * which is what a reload does: commands are re-registered, never unregistered
 * (ADR-0011).
 */
export const makeFakeCommandRegistrar = (): FakeCommandRegistrar => {
  const roots: Array<CommandNode> = [];

  return {
    register: (root) => {
      const index = roots.findIndex((candidate) => candidate.name === root.name);
      if (index >= 0) {
        roots[index] = root;
      } else {
        roots.push(root);
      }
    },
    roots: () => roots.slice(),
    clear: () => {
      roots.length = 0;
    },
  };
};

/** The layer a runtime needs so a program's `Commands.attach` is recorded. */
export const commandRegistrarLayer = (registrar: FakeCommandRegistrar): Layer.Layer<never> =>
  Layer.succeed(CommandRegistrar, registrar);
