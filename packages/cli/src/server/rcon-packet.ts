/** Source RCON packet types used by Paper. */
export const SERVERDATA_RESPONSE_VALUE = 0;
export const SERVERDATA_EXECCOMMAND = 2;
export const SERVERDATA_AUTH_RESPONSE = 2;
export const SERVERDATA_AUTH = 3;

export interface RconPacket {
  readonly id: number;
  readonly type: number;
  readonly body: string;
}

/**
 * Encodes one Source RCON packet: little-endian length, request id, type, a
 * NUL-terminated body, and the second NUL the protocol requires.
 */
export function encodeRconPacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, "utf8");
  const packet = Buffer.alloc(4 + 4 + 4 + payload.length + 2);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

const MINIMUM_LENGTH = 10;
const MAXIMUM_LENGTH = 4 * 1024 * 1024;

/** Reassembles packets from arbitrarily split TCP chunks. */
export class RconPacketReader {
  #buffer = Buffer.alloc(0);

  push(chunk: Buffer): RconPacket[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const packets: RconPacket[] = [];

    while (this.#buffer.length >= 4) {
      const length = this.#buffer.readInt32LE(0);
      if (length < MINIMUM_LENGTH || length > MAXIMUM_LENGTH) {
        throw new Error(`Invalid RCON packet length ${length}`);
      }
      if (this.#buffer.length < 4 + length) {
        break;
      }

      const packet = this.#buffer.subarray(4, 4 + length);
      packets.push({
        id: packet.readInt32LE(0),
        type: packet.readInt32LE(4),
        body: packet.subarray(8, packet.length - 2).toString("utf8"),
      });
      this.#buffer = this.#buffer.subarray(4 + length);
    }

    return packets;
  }
}
