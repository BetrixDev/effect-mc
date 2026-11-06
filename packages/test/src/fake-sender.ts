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
}

export const makeFakeSender = (name = "tester"): FakeSender => {
  const messages: Array<string> = [];

  return {
    name,
    messages: () => messages.slice(),
    send: (message) => {
      messages.push(message);
    },
    clear: () => {
      messages.length = 0;
    },
  };
};
