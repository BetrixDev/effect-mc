import * as commands from "@effectmc/commands";
import * as core from "@effectmc/core";
import { Schema } from "effect";
import { expect, test } from "vite-plus/test";
import * as testApi from "./index";

interface PropertySignature {
  readonly name: string | symbol;
}

interface SchemaAst {
  readonly typeParameters?: ReadonlyArray<{
    readonly propertySignatures?: ReadonlyArray<PropertySignature>;
  }>;
}

/**
 * The top-level field names of a schema-backed class. A tagged error's first
 * type parameter is the struct that includes `_tag` plus the declared fields.
 */
const fieldNames = (schema: unknown): ReadonlyArray<string | symbol> => {
  if (typeof schema !== "function" || !Schema.isSchema(schema)) {
    return [];
  }

  const ast = (schema as { readonly ast?: SchemaAst }).ast;
  const target = ast?.typeParameters?.[0];
  return (target?.propertySignatures ?? []).map((property) => property.name);
};

const taggedErrors = (module: Record<string, unknown>): ReadonlyArray<readonly [string, unknown]> =>
  Object.entries(module).filter(([, value]) => fieldNames(value).includes("_tag"));

test("the field checker sees a field named name", () => {
  class BadTaggedError extends Schema.TaggedError<BadTaggedError>()("BadTaggedError", {
    name: Schema.String,
  }) {}

  expect(fieldNames(BadTaggedError)).toContain("name");
});

test("no tagged error declares a field named name", () => {
  const modules: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["@effectmc/core", core as unknown as Record<string, unknown>],
    ["@effectmc/commands", commands as unknown as Record<string, unknown>],
    ["@effectmc/test", testApi as unknown as Record<string, unknown>],
  ];

  const offenders = modules.flatMap(([packageName, module]) =>
    taggedErrors(module)
      .filter(([, schema]) => fieldNames(schema).includes("name"))
      .map(([exportName]) => `${packageName}#${exportName}`),
  );

  expect(offenders).toEqual([]);
});
