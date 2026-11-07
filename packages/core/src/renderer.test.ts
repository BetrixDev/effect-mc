import { Effect } from "effect";
import { expect, test } from "vite-plus/test";
import { PermissionDenied, Renderer, SenderNotPlayer } from "./index";

const render = (failure: unknown): Promise<string> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const renderer = yield* Renderer;
      return renderer.render(failure);
    }).pipe(Effect.provide(Renderer.layer)),
  );

const permissionDenied = () =>
  new PermissionDenied({
    permission: "effectmc.warp",
    sender: "tester",
    message: "Sender 'tester' lacks permission 'effectmc.warp'.",
  });

const senderNotPlayer = () =>
  new SenderNotPlayer({
    sender: "console",
    message: "Sender 'console' is not a player.",
  });

test("the default renderer keeps permission and player-only failures distinct", async () => {
  const denied = await render(permissionDenied());
  const notPlayer = await render(senderNotPlayer());

  expect(denied).toContain("permission");
  expect(notPlayer).toContain("player");
  expect(denied).not.toBe(notPlayer);
  expect(denied).not.toContain("player");
  expect(notPlayer).not.toContain("permission");
});

test("the default renderer uses a tagged error's message when it has one", async () => {
  const message = await render({
    _tag: "WarpNotFound",
    message: "Warp 'home' does not exist.",
  });

  expect(message).toBe("Warp 'home' does not exist.");
});

test("the default renderer names a tagged error that carries no message", async () => {
  const message = await render({ _tag: "WarpNotFound" });

  expect(message).toContain("WarpNotFound");
});

test("the default renderer falls back for an untagged value", async () => {
  const message = await render(new Error("boom"));

  expect(message).toContain("server log");
  expect(message).not.toContain("boom");
});

test("the renderer is a service, so a host or a test can replace it", async () => {
  const rendered: Array<unknown> = [];
  const custom = {
    render: (failure: unknown) => {
      rendered.push(failure);
      return "custom failure";
    },
  };

  const message = await Effect.runPromise(
    Effect.gen(function* () {
      const renderer = yield* Renderer;
      return renderer.render(permissionDenied());
    }).pipe(Effect.provideService(Renderer, custom)),
  );

  expect(message).toBe("custom failure");
  expect(rendered).toHaveLength(1);
  expect(rendered[0]).toBeInstanceOf(PermissionDenied);
});
