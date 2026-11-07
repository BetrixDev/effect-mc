import type { Player } from "@effectmc/paper-types";
import { Context, Effect } from "effect";
import { SenderNotPlayer } from "./errors";
import { inMain } from "./facade";
import { Main } from "./threads";

/**
 * The current command source. The commands surface provides it for the
 * duration of one execution; the runtime supplies a fallback outside a
 * command. Wide enough for the fake sender and narrow enough that the Paper
 * host does not have to implement Bukkit's whole `CommandSender` interface.
 */
export interface SenderValue {
  /** The sender's name, as it appears in command output. */
  readonly name: string;
  /** Records one rendered message. */
  readonly send: (message: string) => void;
  /** The player behind the sender, when the sender is a player. */
  readonly player?: Player;
}

/**
 * The ambient sender the `Sender` façade reads. The commands surface overrides
 * it per execution, so an author never threads a sender through a handler.
 */
export class SenderContext extends Context.Service<SenderContext, SenderValue>()(
  "effectmc/SenderContext",
) {}

/**
 * The fallback used when no command is executing. `asPlayer` reports a console
 * sender and `send` fails loudly rather than dropping output. Hosts and the
 * test harness replace it with a real sender.
 */
export const unavailableSender: SenderValue = {
  name: "console",
  send: () => {
    throw new Error(
      "No command sender is in scope. Sender is available inside a command, or when the host supplies a sender.",
    );
  },
};

/**
 * The command-source façade. Every method carries `Main` because v0 treats
 * command output as part of the world surface (ADR-0003, ADR-0006).
 */
export const Sender = {
  /** The command source's player, or `SenderNotPlayer` for the console. */
  asPlayer: Effect.gen(function* () {
    yield* Main;
    const sender = yield* SenderContext;

    if (sender.player === undefined) {
      return yield* Effect.fail(
        new SenderNotPlayer({
          sender: sender.name,
          message: `Sender '${sender.name}' is not a player.`,
        }),
      );
    }

    return sender.player;
  }),

  /** Sends one rendered message to the command source. */
  send: (message: string): Effect.Effect<void, never, SenderContext | Main> =>
    Effect.gen(function* () {
      const sender = yield* SenderContext;
      return yield* inMain(() => sender.send(message));
    }),
};
