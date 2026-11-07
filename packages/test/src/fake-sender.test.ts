import { expect, test } from "vite-plus/test";
import { makeFakeSender } from "./fake-sender";

test("records rendered messages in order", () => {
  const sender = makeFakeSender("alex");

  sender.send("Welcome, alex.");
  sender.send("You are not permitted.");

  expect(sender.name).toBe("alex");
  expect(sender.messages()).toEqual(["Welcome, alex.", "You are not permitted."]);
});

test("clears recorded messages without renaming the sender", () => {
  const sender = makeFakeSender("alex");
  sender.send("one");

  sender.clear();

  expect(sender.name).toBe("alex");
  expect(sender.messages()).toEqual([]);
});

test("returns a snapshot rather than the live message list", () => {
  const sender = makeFakeSender();
  sender.send("one");

  const messages = sender.messages();
  (messages as Array<string>).length = 0;

  expect(sender.messages()).toEqual(["one"]);
});

test("holds the permissions a test grants it", () => {
  const sender = makeFakeSender("alex", { permissions: ["effectmc.warp"] });

  expect(sender.hasPermission("effectmc.warp")).toBe(true);
  expect(sender.hasPermission("effectmc.admin")).toBe(false);
});

test("accepts an arbitrary permission check and name", () => {
  const sender = makeFakeSender("ignored", {
    name: "console",
    hasPermission: (permission) => permission.startsWith("effectmc."),
  });

  expect(sender.name).toBe("console");
  expect(sender.hasPermission("effectmc.warp")).toBe(true);
  expect(sender.hasPermission("minecraft.command.op")).toBe(false);
});
