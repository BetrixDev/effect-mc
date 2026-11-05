import { describe, expect, test } from "vite-plus/test";
import { parsePin } from "./artifact.ts";

const valid = {
  coordinate: "io.papermc.paper:paper-api:1",
  version: "1",
  url: "https://example.invalid/paper-api.jar",
  sha256: "deadbeef",
};

describe("paper-api pin", () => {
  test("reads the four required fields", () => {
    expect(parsePin(JSON.stringify(valid), "paper-api.json")).toEqual(valid);
  });

  test("rejects a missing field instead of trusting JSON.parse", () => {
    expect(() =>
      parsePin(JSON.stringify({ ...valid, sha256: undefined }), "paper-api.json"),
    ).toThrow(/sha256 must be a non-empty string/);
  });

  test("rejects an empty field", () => {
    expect(() => parsePin(JSON.stringify({ ...valid, version: "" }), "paper-api.json")).toThrow(
      /version must be a non-empty string/,
    );
  });

  test("rejects malformed JSON", () => {
    expect(() => parsePin("{", "paper-api.json")).toThrow(/invalid JSON/);
  });
});
