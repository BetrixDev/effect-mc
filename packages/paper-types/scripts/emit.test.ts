import { describe, expect, test } from "vite-plus/test";
import { emit } from "./emit.ts";
import type { ClassModel, MethodModel, ParameterModel } from "./model.ts";
import type { JType } from "./jvm.ts";
import type { Overlay } from "./overlays.ts";

const pin = {
  coordinate: "test:paper-api:1",
  version: "1",
  url: "https://example.invalid/paper-api.jar",
  sha256: "deadbeef",
};

function method(
  name: string,
  parameters: ReadonlyArray<JType>,
  result: JType,
  options: Partial<MethodModel> = {},
): MethodModel {
  return {
    name,
    typeParameters: [],
    parameters: parameters.map((type, index): ParameterModel => ({ name: `arg${index}`, type })),
    result,
    isStatic: false,
    isAbstract: false,
    isVarargs: false,
    ...options,
  };
}

function classModel(
  fqn: string,
  kind: ClassModel["kind"],
  options: Partial<ClassModel> = {},
): ClassModel {
  const simpleName = fqn.slice(fqn.lastIndexOf(".") + 1);
  const packageName = fqn.slice(0, fqn.lastIndexOf("."));
  return {
    fqn,
    binaryName: fqn.replaceAll(".", "/"),
    packageName,
    namespacePath: packageName,
    simpleName,
    kind,
    isAbstract: false,
    isFinal: false,
    typeParameters: [],
    superClass: { kind: "class", name: "java.lang.Object", args: [] },
    interfaces: [],
    fields: [],
    methods: [],
    constructors: [],
    enumConstants: [],
    ...options,
  };
}

const stringType: JType = { kind: "class", name: "java.lang.String", args: [] };
const voidType: JType = { kind: "void" };
const baseType: JType = {
  kind: "class",
  name: "org.example.Base",
  args: [],
};
const childType: JType = {
  kind: "class",
  name: "org.example.Child",
  args: [],
};
const listOfChild: JType = {
  kind: "class",
  name: "java.util.List",
  args: [childType],
};
const uuidType: JType = {
  kind: "class",
  name: "java.util.UUID",
  args: [],
};

const classes: ClassModel[] = [
  classModel("org.example.Base", "interface", {
    methods: [method("foo", [], stringType, { isAbstract: true })],
  }),
  classModel("org.example.Child", "class", {
    interfaces: [baseType],
    constructors: [method("constructor", [], voidType)],
    methods: [method("foo", [], stringType)],
  }),
  classModel("org.example.Child$Inner", "interface"),
  classModel("org.example.Replaced", "interface", {
    methods: [method("generatedOnly", [], stringType, { isAbstract: true })],
  }),
  classModel("org.example.Uses", "class", {
    methods: [method("list", [], listOfChild), method("id", [], uuidType)],
  }),
];

const mergeOverlay: Overlay = {
  target: "org.example.Child",
  mode: "merge",
  reason: "The generator cannot add this declaration.",
  file: "child.d.ts",
  body: `export namespace org.example {
  export interface Child {
    extra(): void;
  }
}`,
};

const replaceOverlay: Overlay = {
  target: "org.example.Replaced",
  mode: "replace",
  reason: "A hand-written declaration is clearer here.",
  file: "replaced.d.ts",
  body: `export namespace org.example {
  export interface Replaced {
    replacementOnly(): string;
  }
}`,
};

describe("emit", () => {
  test("renders classes, interfaces, nested names, and mapped collection types", () => {
    const result = emit({ pin, classes, overlays: [] });

    expect(result.dts).toContain("export namespace org.example {");
    expect(result.dts).toContain("export interface Base {");
    expect(result.dts).toContain("export class Child implements org.example.Base");
    expect(result.dts).toContain("export interface Child$Inner {}");
    expect(result.dts).toContain("list(): org.example.Child[];");
    expect(result.dts).toContain("export type Child = org.example.Child;");
  });

  test("hoists unresolved types into the external namespace", () => {
    const result = emit({ pin, classes, overlays: [] });

    expect(result.dts).toContain("id(): __paperExternal.java.util.UUID;");
    expect(result.dts).toContain("export namespace __paperExternal.java.util {");
    expect(result.dts).toContain("export interface UUID {}");
  });

  test("merge overlays keep the generated declaration and add the patch", () => {
    const result = emit({ pin, classes, overlays: [mergeOverlay] });

    expect(result.dts).toContain("export class Child implements");
    expect(result.dts).toContain("extra(): void;");
    expect(result.manifest).toContain('"mode": "merge"');
  });

  test("replace overlays remove the generated declaration", () => {
    const result = emit({ pin, classes, overlays: [replaceOverlay] });

    expect(result.dts).not.toContain("generatedOnly(): string;");
    expect(result.dts).toContain("replacementOnly(): string;");
    expect(result.manifest).toContain('"mode": "replace"');
  });

  test("is deterministic", () => {
    const first = emit({ pin, classes, overlays: [mergeOverlay] });
    const second = emit({ pin, classes, overlays: [mergeOverlay] });

    expect(second.dts).toBe(first.dts);
    expect(second.manifest).toBe(first.manifest);
  });

  test("rejects an overlay for a class outside the artifact", () => {
    expect(() =>
      emit({
        pin,
        classes,
        overlays: [{ ...mergeOverlay, target: "org.example.Missing" }],
      }),
    ).toThrow(/not in the pinned artifact/);
  });
});
