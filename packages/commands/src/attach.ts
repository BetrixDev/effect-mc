import { Boundary, Main, SenderContext } from "@effectmc/core";
import { Context, Effect } from "effect";
import type { AnyCommandArgument, CommandInvocation, CommandPermissionSubject } from "./argument";
import { type AnyCommand, type Command, permissionDenied, run } from "./command";

type AttachRequirement<R> = Exclude<Exclude<R, Main>, SenderContext>;

/**
 * One command node as a host registers it. The node carries the shape a host
 * walks to build Brigadier literals and arguments, plus the closures it runs
 * for a dispatch.
 */
export interface CommandNode {
  readonly name: string;
  readonly description?: string;
  /** The permission declared on this node. Ancestor permissions are folded into `requires`. */
  readonly permission?: string;
  readonly arguments: ReadonlyArray<AnyCommandArgument>;
  readonly subcommands: ReadonlyArray<CommandNode>;
  /**
   * The registration-time permission check. The Paper host passes it to
   * Brigadier's `requires`, which is re-evaluated per dispatch.
   */
  readonly requires: (subject: CommandPermissionSubject) => boolean;
  /**
   * Runs one invocation with the plugin's services captured at attach time.
   * `Main` and the command sender are supplied here, not by the handler.
   * Errors are heterogeneous across a tree, so the host's boundary renders or
   * logs them (ADR-0005).
   */
  readonly execute: (invocation: CommandInvocation) => Effect.Effect<void, unknown>;
  /**
   * The host-facing execution path. It wraps {@link execute} in the core
   * command boundary: tagged failures render to this invocation's sender,
   * untagged defects log with their stack, and the effect never fails. A host
   * dispatches commands through this verb.
   */
  readonly dispatch: (invocation: CommandInvocation) => Effect.Effect<void>;
}

/**
 * The host seam behind `Commands.attach`. Paper's `Commands.register` returns
 * only root labels and has no unregister, so this interface returns `void`
 * and a reload re-registers (ADR-0011).
 */
export interface CommandRegistrarService {
  readonly register: (root: CommandNode) => void;
}

/**
 * The registrar a host installs in the runtime's services. The default fails
 * loudly rather than dropping a declaration silently when no host is present.
 */
export const CommandRegistrar = Context.Reference<CommandRegistrarService>(
  "effectmc/CommandRegistrar",
  {
    defaultValue: () => ({
      register: () => {
        throw new Error(
          "No command registrar is installed. A host must provide CommandRegistrar through PluginRuntimeOptions.hostServices.",
        );
      },
    }),
  },
);

const buildNode = (
  command: AnyCommand,
  context: Context.Context<unknown>,
  inherited: ReadonlyArray<string> = [],
): CommandNode => {
  // A permission declared on a parent protects its whole subtree. Brigadier's
  // `requires` enforces that during parse; the node repeats the ancestor
  // checks at execution so the re-check covers the same tree (ADR-0019).
  const own = command.permission === undefined ? inherited : [...inherited, command.permission];

  const execute = (invocation: CommandInvocation): Effect.Effect<void, unknown> => {
    const missing = inherited.find(
      (permission) => invocation.source.sender.hasPermission?.(permission) !== true,
    );
    if (missing !== undefined) {
      return Effect.fail(permissionDenied(missing, invocation.source.sender));
    }
    return run(command, invocation).pipe(Effect.provide(context));
  };

  return {
    name: command.name,
    description: command.description,
    permission: command.permission,
    arguments: command.arguments,
    subcommands: command.subcommands.map((child) => buildNode(child, context, own)),
    requires: (subject) => own.every((permission) => subject.hasPermission(permission)),
    execute,
    dispatch: (invocation) =>
      Boundary.command(execute(invocation), {
        sender: invocation.source.sender,
        command: command.name,
      }).pipe(Effect.provide(context)),
  };
};

/**
 * Registers a command tree for the plugin's lifetime. It returns `void`:
 * commands have no detachable handle and are re-registered on reload, so there
 * is nothing for an author to hold (ADR-0011).
 *
 * The tree's handlers keep the services in scope at attach time. `Main` and
 * the command sender are supplied per execution and never appear as attach
 * requirements.
 */
export function attach<A, E, R>(
  command: Command<A, E, R>,
): Effect.Effect<void, E, AttachRequirement<R>> {
  return Effect.gen(function* () {
    const registrar = yield* CommandRegistrar;
    const context = yield* Effect.context<AttachRequirement<R>>();
    // The node tree is erased on purpose: a host registers a heterogeneous
    // tree, and `attach`'s signature has already proved every handler's
    // requirements are present in this context.
    registrar.register(buildNode(command, context as unknown as Context.Context<unknown>));
  });
}

/** The command surface's registration verb. */
export const Commands = {
  attach,
};
