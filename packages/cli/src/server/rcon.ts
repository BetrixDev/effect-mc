import { createConnection, type Socket } from "node:net";
import { assertContainerName } from "@effectmc/vite";
import { formatError, type Logger } from "../log";
import {
  encodeRconPacket,
  RconPacketReader,
  SERVERDATA_AUTH,
  SERVERDATA_EXECCOMMAND,
  type RconPacket,
} from "./rcon-packet";

export interface RconSettings {
  readonly host: string;
  readonly port: number;
  readonly password: string;
}

export interface RconConnection {
  command(command: string): Promise<string>;
  close(): Promise<void>;
}

export interface RconConnector {
  connect(settings: RconSettings, options?: { timeoutMs?: number }): Promise<RconConnection>;
}

/** The one verb the dev loop needs: the host's scoped reload (ADR-0017). */
export interface ScopedReloader {
  reload(name: string): Promise<void>;
}

export class RconUnavailableError extends Error {
  override readonly name = "RconUnavailableError";

  constructor(settings: RconSettings, detail: string) {
    super(`${detail}\n\n${rconInstruction(settings.port)}`);
  }
}

export class RconCommandError extends Error {
  override readonly name = "RconCommandError";
}

/** The instruction a missing or unreachable RCON endpoint produces. */
export function rconInstruction(port = 25575): string {
  return [
    "RCON is how effectmc dev triggers the host's scoped reload.",
    "Enable it in server.properties and restart the server:",
    "",
    "  enable-rcon=true",
    `  rcon.port=${port}`,
    "  rcon.password=<a secret>",
    "",
    "Or run effectmc dev without --server to let it manage a server.",
  ].join("\n");
}

/** Sends `/effectmc reload <name>` and treats the host's refusal as an error. */
export class RconScopedReloader implements ScopedReloader {
  constructor(
    private readonly connection: RconConnection,
    private readonly log: Logger = () => {},
  ) {}

  async reload(name: string): Promise<void> {
    assertContainerName(name);
    let response: string;
    try {
      response = await this.connection.command(`effectmc reload ${name}`);
    } catch (error) {
      throw error instanceof RconUnavailableError
        ? error
        : new RconCommandError(`Could not reload '${name}': ${formatError(error)}`);
    }

    if (/no container named/i.test(response)) {
      throw new RconCommandError(
        `The host has no container named '${name}' loaded. ` +
          "If this is an existing server, restart it once so the host discovers the container, " +
          `then run effectmc dev again.\n${response.trim()}`,
      );
    }
    if (/could not reload/i.test(response)) {
      throw new RconCommandError(`The host refused to reload '${name}': ${response.trim()}`);
    }
    if (response.trim().length > 0) {
      this.log(response.trim());
    }
  }
}

interface PendingReply {
  resolve(packet: RconPacket): void;
  reject(error: Error): void;
}

/** A minimal Source RCON client over one TCP connection. */
export class NodeRconConnector implements RconConnector {
  async connect(
    settings: RconSettings,
    options: { timeoutMs?: number } = {},
  ): Promise<RconConnection> {
    const timeoutMs = options.timeoutMs ?? 2_000;
    const socket = createConnection({ host: settings.host, port: settings.port });
    const reader = new RconPacketReader();
    const pending = new Map<number, PendingReply>();
    let closed = false;
    let awaitingAuth = true;

    const failAll = (error: Error): void => {
      for (const reply of pending.values()) reply.reject(error);
      pending.clear();
    };

    socket.on("data", (chunk: Buffer) => {
      let packets: RconPacket[];
      try {
        packets = reader.push(chunk);
      } catch (error) {
        closed = true;
        failAll(
          new RconUnavailableError(
            settings,
            `Malformed RCON packet from ${settings.host}:${settings.port}: ${formatError(error)}.`,
          ),
        );
        socket.destroy();
        return;
      }

      for (const packet of packets) {
        // Source RCON answers a rejected password with id -1, not the request id.
        const id = awaitingAuth && packet.id === -1 ? 1 : packet.id;
        const reply = pending.get(id);
        if (reply !== undefined) {
          pending.delete(id);
          reply.resolve(packet);
        }
      }
    });
    socket.on("error", (error) => {
      closed = true;
      failAll(
        new RconUnavailableError(
          settings,
          `RCON connection to ${settings.host}:${settings.port} failed: ${error.message}.`,
        ),
      );
    });
    socket.on("close", () => {
      closed = true;
      failAll(
        new RconUnavailableError(
          settings,
          `RCON connection to ${settings.host}:${settings.port} closed.`,
        ),
      );
    });

    await connectSocket(socket, settings, timeoutMs);

    const request = (id: number, type: number, body: string): Promise<RconPacket> =>
      new Promise<RconPacket>((resolve, reject) => {
        if (closed) {
          reject(new RconUnavailableError(settings, "The RCON connection is closed."));
          return;
        }

        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            new RconUnavailableError(
              settings,
              `Timed out waiting for an RCON response on ${settings.host}:${settings.port}.`,
            ),
          );
        }, timeoutMs);

        pending.set(id, {
          resolve: (packet) => {
            clearTimeout(timer);
            resolve(packet);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });

        socket.write(encodeRconPacket(id, type, body), (error) => {
          if (error !== undefined && error !== null) {
            pending.delete(id);
            clearTimeout(timer);
            reject(
              new RconUnavailableError(
                settings,
                `Could not write to the RCON connection: ${error.message}.`,
              ),
            );
          }
        });
      });

    const auth = await request(1, SERVERDATA_AUTH, settings.password);
    awaitingAuth = false;
    if (auth.id === -1) {
      socket.destroy();
      throw new RconUnavailableError(
        settings,
        "RCON authentication failed. Check rcon.password in server.properties and restart the server.",
      );
    }

    let nextId = 2;
    const command = async (value: string): Promise<string> => {
      const packet = await request(nextId++, SERVERDATA_EXECCOMMAND, value);
      return packet.body;
    };

    return {
      command,
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        failAll(new RconUnavailableError(settings, "The RCON connection is closing."));
        await closeSocket(socket, timeoutMs);
      },
    };
  }
}

async function connectSocket(
  socket: Socket,
  settings: RconSettings,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(
        new RconUnavailableError(
          settings,
          `Timed out connecting to RCON on ${settings.host}:${settings.port}.`,
        ),
      );
    }, timeoutMs);

    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(
        new RconUnavailableError(
          settings,
          `RCON is not reachable on ${settings.host}:${settings.port}: ${error.message}.`,
        ),
      );
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

async function closeSocket(socket: Socket, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    if (socket.destroyed) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      socket.destroy();
      resolve();
    }, timeoutMs);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.end();
  });
}
