import { Argument, Command, Commands } from "@effectmc/commands";
import {
  Events,
  Observability,
  type ObservabilityLevel,
  Plugin,
  Renderer,
  Sender,
  SenderNotPlayer,
} from "@effectmc/core";
import { Cause, Effect, Layer, Result } from "effect";
import { expect, test } from "vite-plus/test";
import { TestHarness } from "./harness";

interface LogRecord {
  readonly level: ObservabilityLevel;
  readonly message: string;
  readonly cause: unknown;
}

const recordingObservability = (records: Array<LogRecord>) =>
  Layer.succeed(Observability, {
    log: (level, message, cause) =>
      Effect.sync(() => {
        records.push({ level, message, cause });
      }),
  });

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not met before the timeout");
};

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

class ChatEvent {
  constructor(private readonly asynchronous = false) {}

  isAsynchronous(): boolean {
    return this.asynchronous;
  }
}

const playerOnly = () =>
  Effect.gen(function* () {
    yield* Sender.asPlayer;
  });

test("a failing command renders to its sender and leaves the runtime running", async () => {
  const harness = TestHarness.make(
    Plugin(
      "commands",
      Layer.empty,
      Effect.gen(function* () {
        yield* Commands.attach(Command.make("sethome", {}, playerOnly));
      }),
    ),
    { development: false },
  );

  await harness.start();

  const node = harness.commands.roots()[0]!;
  await Effect.runPromise(
    node.dispatch({
      source: { sender: harness.sender },
      argument: () => undefined,
    }),
  );

  expect(harness.sender.messages()).toEqual(["This command can only be run by a player."]);
  expect(harness.runtime.status).toBe("running");

  await harness.teardown();
});

test("a command denied by permission renders a distinct message", async () => {
  const harness = TestHarness.make(
    Plugin(
      "commands",
      Layer.empty,
      Effect.gen(function* () {
        yield* Commands.attach(
          Command.make("warp", { name: Argument.String("name") }, () => Effect.void).pipe(
            Command.permission("effectmc.warp"),
          ),
        );
      }),
    ),
    { development: false },
  );

  await harness.start();

  const node = harness.commands.roots()[0]!;
  await Effect.runPromise(
    node.dispatch({
      source: { sender: harness.sender },
      argument: () => "home",
    }),
  );

  expect(harness.sender.messages()).toEqual(["You do not have permission to use this command."]);

  await harness.teardown();
});

test("a harness can replace the renderer", async () => {
  const custom = Layer.succeed(Renderer, {
    render: () => "rendered by the host",
  });

  const harness = TestHarness.make(
    Plugin(
      "commands",
      Layer.empty,
      Effect.gen(function* () {
        yield* Commands.attach(Command.make("sethome", {}, playerOnly));
      }),
    ),
    { development: false, renderer: custom },
  );

  await harness.start();

  const node = harness.commands.roots()[0]!;
  await Effect.runPromise(
    node.dispatch({
      source: { sender: harness.sender },
      argument: () => undefined,
    }),
  );

  expect(harness.sender.messages()).toEqual(["rendered by the host"]);

  await harness.teardown();
});

test("a failing sync event handler renders and logs a tagged error", async () => {
  const records: Array<LogRecord> = [];

  const harness = TestHarness.make(
    Plugin(
      "events",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "sync" }, () =>
          Effect.fail(new SenderNotPlayer({ sender: "console", message: "not a player" })),
        );
      }),
    ),
    { development: true, observability: recordingObservability(records) },
  );

  await harness.start();

  expect(() => harness.events.dispatch(ChatEvent, new ChatEvent(false))).not.toThrow();

  expect(harness.sender.messages()).toEqual(["This command can only be run by a player."]);
  expect(records).toHaveLength(1);
  expect(records[0]?.message).toContain("ChatEvent");

  await harness.teardown();
});

test("an untagged sync event failure fails loudly in development", async () => {
  const records: Array<LogRecord> = [];
  const defect = defectWithStack();

  const harness = TestHarness.make(
    Plugin(
      "events",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "sync" }, () => Effect.die(defect));
      }),
    ),
    { development: true, observability: recordingObservability(records) },
  );

  await harness.start();

  expect(() => harness.events.dispatch(ChatEvent, new ChatEvent(false))).toThrow("boom");

  expect(records).toHaveLength(1);
  expect(firstDefect(records).stack).toContain("boundary-test");

  await harness.teardown();
});

test("an untagged sync event failure renders and logs in production", async () => {
  const records: Array<LogRecord> = [];

  const harness = TestHarness.make(
    Plugin(
      "events",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "sync" }, () => Effect.die(defectWithStack()));
      }),
    ),
    { development: false, observability: recordingObservability(records) },
  );

  await harness.start();

  expect(() => harness.events.dispatch(ChatEvent, new ChatEvent(false))).not.toThrow();

  expect(harness.sender.messages()).toEqual([
    "Something went wrong. Check the server log for details.",
  ]);
  expect(records).toHaveLength(1);
  expect(firstDefect(records).stack).toContain("boundary-test");

  await harness.teardown();
});

test("a harness's replaced renderer is used on the event path too", async () => {
  const custom = Layer.succeed(Renderer, {
    render: () => "event rendered by the host",
  });

  const harness = TestHarness.make(
    Plugin(
      "events",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "sync" }, () =>
          Effect.fail(new SenderNotPlayer({ sender: "console", message: "not a player" })),
        );
      }),
    ),
    { development: true, renderer: custom },
  );

  await harness.start();

  harness.events.dispatch(ChatEvent, new ChatEvent(false));

  expect(harness.sender.messages()).toEqual(["event rendered by the host"]);

  await harness.teardown();
});

test("a failing async event handler renders and logs", async () => {
  const records: Array<LogRecord> = [];

  const harness = TestHarness.make(
    Plugin(
      "events",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "async" }, () => Effect.die(defectWithStack()));
      }),
    ),
    { development: false, observability: recordingObservability(records) },
  );

  await harness.start();

  harness.events.dispatch(ChatEvent, new ChatEvent(true));
  await waitFor(() => records.length > 0);

  expect(harness.sender.messages()).toEqual([
    "Something went wrong. Check the server log for details.",
  ]);
  expect(firstDefect(records).stack).toContain("boundary-test");

  await harness.teardown();
});
