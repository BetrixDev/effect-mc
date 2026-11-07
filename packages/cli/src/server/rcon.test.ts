import { createServer, type AddressInfo, type Socket } from "node:net";
import { expect, test } from "vite-plus/test";
import {
  NodeRconConnector,
  RconScopedReloader,
  RconUnavailableError,
  type RconConnection,
  type RconSettings,
} from "./rcon";
import {
  encodeRconPacket,
  RconPacketReader,
  SERVERDATA_AUTH,
  SERVERDATA_AUTH_RESPONSE,
  SERVERDATA_EXECCOMMAND,
  SERVERDATA_RESPONSE_VALUE,
} from "./rcon-packet";

const settings: RconSettings = { host: "127.0.0.1", port: 25575, password: "secret" };

const connection = (response: string) => {
  const commands: string[] = [];
  const client: RconConnection = {
    async command(command) {
      commands.push(command);
      return response;
    },
    async close() {},
  };
  return { client, commands };
};

test("sends the host's scoped reload command", async () => {
  const { client, commands } = connection("Reloaded 'hello'.");
  const reloader = new RconScopedReloader(client);

  await reloader.reload("hello");

  expect(commands).toEqual(["effectmc reload hello"]);
});

test("reports the host's reload failure instead of pretending it succeeded", async () => {
  const { client } = connection("Could not reload 'hello': no container named 'hello'");
  const reloader = new RconScopedReloader(client);

  const failure = reloader.reload("hello");
  await expect(failure).rejects.toThrow(/restart it once/);
  await expect(failure).rejects.toThrow(/no container named/);
});

test("refuses a name that could inject another command", async () => {
  const { client, commands } = connection("");
  const reloader = new RconScopedReloader(client);

  await expect(reloader.reload("hello stop")).rejects.toThrow(/container name/);
  expect(commands).toEqual([]);
});

test("missing RCON is an instruction, not a timeout", () => {
  const error = new RconUnavailableError(
    settings,
    "The server at /srv/paper is not reachable over RCON on 127.0.0.1:25575.",
  );

  expect(error.message).toContain("enable-rcon=true");
  expect(error.message).toContain("rcon.password");
  expect(error.message).toContain("rcon.port");
});

const fakeServer = async (password: string): Promise<{ port: number; close(): Promise<void> }> => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const reader = new RconPacketReader();
    socket.on("data", (chunk: Buffer) => {
      for (const packet of reader.push(chunk)) {
        if (packet.type === SERVERDATA_AUTH) {
          socket.write(
            encodeRconPacket(
              packet.body === password ? packet.id : -1,
              SERVERDATA_AUTH_RESPONSE,
              "",
            ),
          );
        } else if (packet.type === SERVERDATA_EXECCOMMAND) {
          socket.write(encodeRconPacket(packet.id, SERVERDATA_RESPONSE_VALUE, "Reloaded 'hello'."));
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

test("speaks Source RCON to a real socket", async () => {
  const server = await fakeServer("secret");
  const connector = new NodeRconConnector();
  try {
    const client = await connector.connect({
      host: "127.0.0.1",
      port: server.port,
      password: "secret",
    });
    await expect(client.command("effectmc reload hello")).resolves.toBe("Reloaded 'hello'.");
    await client.close();
  } finally {
    await server.close();
  }
});

test("a rejected password is an instruction, not a hang", async () => {
  const server = await fakeServer("secret");
  const connector = new NodeRconConnector();
  try {
    await expect(
      connector.connect(
        { host: "127.0.0.1", port: server.port, password: "wrong" },
        { timeoutMs: 500 },
      ),
    ).rejects.toThrow(/authentication failed/);
  } finally {
    await server.close();
  }
});
