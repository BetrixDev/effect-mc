import { expect, test } from "vite-plus/test";
import {
  encodeRconPacket,
  RconPacketReader,
  SERVERDATA_AUTH,
  SERVERDATA_AUTH_RESPONSE,
} from "./rcon-packet";

test("round-trips a packet", () => {
  const reader = new RconPacketReader();
  const packets = reader.push(encodeRconPacket(7, SERVERDATA_AUTH_RESPONSE, "hello"));

  expect(packets).toEqual([{ id: 7, type: SERVERDATA_AUTH_RESPONSE, body: "hello" }]);
});

test("reassembles a packet split across TCP chunks", () => {
  const reader = new RconPacketReader();
  const packet = encodeRconPacket(-1, SERVERDATA_AUTH_RESPONSE, "nope");

  expect(reader.push(packet.subarray(0, 3))).toEqual([]);
  expect(reader.push(packet.subarray(3, 9))).toEqual([]);
  expect(reader.push(packet.subarray(9))).toEqual([
    { id: -1, type: SERVERDATA_AUTH_RESPONSE, body: "nope" },
  ]);
});

test("encodes the protocol's length, id, type, and two NULs", () => {
  const packet = encodeRconPacket(1, SERVERDATA_AUTH, "secret");

  expect(packet.readInt32LE(0)).toBe(packet.length - 4);
  expect(packet.readInt32LE(4)).toBe(1);
  expect(packet.readInt32LE(8)).toBe(3);
  expect(packet.subarray(12).toString("utf8")).toBe("secret\0\0");
});
