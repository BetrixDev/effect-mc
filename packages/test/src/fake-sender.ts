/**
 * An in-memory command sender. It records the rendered messages a command or
 * event boundary would deliver, so tests can assert on output without an
 * Adventure implementation or a Paper server.
 *
 * The shape is deliberately smaller than Paper's `CommandSender`: v0's
 * `Sender` façade is the only thing that should translate it.
 */
export interface FakeSender {
  /** The sender's name, as it appears in command output. */
  readonly name: string;
  /** The messages recorded so far, in the order they were sent. */
  readonly messages: () => ReadonlyArray<string>;
  /** Records one rendered message. */
  readonly send: (message: string) => void;
  /** Drops the recorded messages without changing the sender's name. */
  readonly clear: () => void;
  /** Whether this sender holds a permission. */
  readonly hasPermission: (permission: string) => boolean;
}

export interface FakeSenderOptions {
  /** The sender's name. Defaults to `tester`. */
  readonly name?: string;
  /** Permissions the sender holds. Defaults to none. */
  readonly permissions?: ReadonlyArray<string>;
  /** Replaces the permission set with an arbitrary check. */
  readonly hasPermission?: (permission: string) => boolean;
}

export const makeFakeSender = (name = "tester", options: FakeSenderOptions = {}): FakeSender => {
  const messages: Array<string> = [];
  const permissions = new Set(options.permissions ?? []);
  const check = options.hasPermission ?? ((permission: string) => permissions.has(permission));

  return {
    name: options.name ?? name,
    messages: () => messages.slice(),
    send: (message) => {
      messages.push(message);
    },
    clear: () => {
      messages.length = 0;
    },
    hasPermission: check,
  };
};
