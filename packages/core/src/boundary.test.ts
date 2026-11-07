import { Cause, Effect, Exit, Layer, Result } from "effect";
import { expect, test } from "vite-plus/test";
import {
  Boundary,
  Observability,
  type ObservabilityLevel,
  Renderer,
  SenderNotPlayer,
} from "./index";
import type { SenderValue } from "./sender";

interface LogRecord {
  readonly level: ObservabilityLevel;
  readonly message: string;
  readonly cause: unknown;
}

const logs = (records: Array<LogRecord>) =>
  Layer.succeed(Observability, {
    log: (level, message, cause) =>
      Effect.sync(() => {
        records.push({ level, message, cause });
      }),
  });

const sender = (): SenderValue & { readonly messages: Array<string> } => {
  const messages: Array<string> = [];
  return {
    messages,
    name: "tester",
    send: (message) => {
      messages.push(message);
    },
  };
};

const provide = (records: Array<LogRecord>) => Layer.merge(Renderer.layer, logs(records));

const defectWithStack = (message = "boom"): Error => {
  const defect = new Error(message);
  defect.stack = `${defect.stack ?? `Error: ${message}`}\n    at boundary-test`;
  return defect;
};

const firstDefect = (records: Array<LogRecord>): Error => {
  const cause = records[0]?.cause;
  if (!Cause.isCause(cause)) {
    throw new Error("Expected the boundary to log a Cause.");
  }
  const defect = Cause.findDefect(cause);
  if (!Result.isSuccess(defect) || !(defect.success instanceof Error)) {
    throw new Error("Expected the cause to carry an Error defect.");
  }
  return defect.success;
};

test("a tagged command failure renders to its sender and never fails", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();

  const exit = await Effect.runPromiseExit(
    Boundary.command(
      Effect.fail(
        new SenderNotPlayer({
          sender: "console",
          message: "Sender 'console' is not a player.",
        }),
      ),
      { sender: target, command: "sethome" },
    ).pipe(Effect.provide(provide(records))),
  );

  expect(Exit.isSuccess(exit)).toBe(true);
  expect(target.messages).toEqual(["This command can only be run by a player."]);
  expect(records).toHaveLength(1);
  expect(records[0]?.message).toContain("SenderNotPlayer");
});

test("an untagged command defect is logged with its stack and never fails", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();
  const defect = defectWithStack();

  const exit = await Effect.runPromiseExit(
    Boundary.command(Effect.die(defect), { sender: target, command: "warp" }).pipe(
      Effect.provide(provide(records)),
    ),
  );

  expect(Exit.isSuccess(exit)).toBe(true);
  expect(target.messages).toEqual([]);
  expect(firstDefect(records).stack).toContain("Error: boom");
  expect(firstDefect(records).stack).toContain("boundary-test");
});

test("the command boundary uses a replaced renderer", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();
  const seen: Array<unknown> = [];
  const custom = Layer.succeed(Renderer, {
    render: (failure: unknown) => {
      seen.push(failure);
      return "rendered by the host";
    },
  });

  await Effect.runPromise(
    Boundary.command(
      Effect.fail(new SenderNotPlayer({ sender: "console", message: "not a player" })),
      { sender: target, command: "sethome" },
    ).pipe(Effect.provide(Layer.merge(custom, logs(records)))),
  );

  expect(target.messages).toEqual(["rendered by the host"]);
  expect(seen).toHaveLength(1);
});

test("a tagged sync event failure is handled and rendered in development", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();

  const outcome = await Effect.runPromise(
    Boundary.syncEvent(
      Cause.fail(new SenderNotPlayer({ sender: "console", message: "not a player" })),
      { event: "ChatEvent", handler: "ChatEvent:sync:normal", sender: target, development: true },
    ).pipe(Effect.provide(provide(records))),
  );

  expect(outcome).toBe("handled");
  expect(target.messages).toEqual(["This command can only be run by a player."]);
  expect(records).toHaveLength(1);
});

test("an untagged sync event failure rethrows in development and logs", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();
  const defect = defectWithStack();

  const outcome = await Effect.runPromise(
    Boundary.syncEvent(Cause.die(defect), {
      event: "ChatEvent",
      handler: "ChatEvent:sync:normal",
      sender: target,
      development: true,
    }).pipe(Effect.provide(provide(records))),
  );

  expect(outcome).toBe("rethrow");
  expect(target.messages).toEqual([]);
  expect(records).toHaveLength(1);
  expect(firstDefect(records).stack).toContain("Error: boom");
});

test("an untagged sync event failure renders and logs in production", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();

  const outcome = await Effect.runPromise(
    Boundary.syncEvent(Cause.die(defectWithStack()), {
      event: "ChatEvent",
      handler: "ChatEvent:sync:normal",
      sender: target,
      development: false,
    }).pipe(Effect.provide(provide(records))),
  );

  expect(outcome).toBe("handled");
  expect(target.messages).toEqual(["Something went wrong. Check the server log for details."]);
  expect(records).toHaveLength(1);
});

test("an async event failure renders and logs", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();
  const defect = defectWithStack();

  await Effect.runPromise(
    Boundary.asyncEvent(Cause.die(defect), {
      event: "AsyncChatEvent",
      handler: "AsyncChatEvent:async:normal",
      sender: target,
    }).pipe(Effect.provide(provide(records))),
  );

  expect(target.messages).toEqual(["Something went wrong. Check the server log for details."]);
  expect(records).toHaveLength(1);
  expect(firstDefect(records).stack).toContain("Error: boom");
});

test("an interrupted handler is not reported as a failure", async () => {
  const records: Array<LogRecord> = [];
  const target = sender();

  const outcome = await Effect.runPromise(
    Boundary.syncEvent(Cause.interrupt(1), {
      event: "ChatEvent",
      handler: "ChatEvent:sync:normal",
      sender: target,
      development: true,
    }).pipe(Effect.provide(provide(records))),
  );

  expect(outcome).toBe("handled");
  expect(target.messages).toEqual([]);
  expect(records).toEqual([]);
});
