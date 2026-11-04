import { expect, test } from "vitest";
import { PACKAGE_NAME } from "./index";

test("exports the package name", () => {
  expect(PACKAGE_NAME).toBe("@effectmc/core");
});
