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
  return {
    fqn,
    namespacePath: fqn.slice(0, fqn.lastIndexOf(".")),
    simpleName,
    kind,
    isAbstract: false,
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
const objectType: JType = { kind: "class", name: "java.lang.Object", args: [] };
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

describe("emit type shapes", () => {
  test("maps function types and varargs parameters", () => {
    const consumerOfString: JType = {
      kind: "class",
      name: "java.util.function.Consumer",
      args: [stringType],
    };
    const stringArray: JType = { kind: "array", element: stringType };
    const result = emit({
      pin,
      classes: [
        classModel("org.example.Functions", "class", {
          methods: [
            method("accept", [consumerOfString], voidType),
            method("join", [stringArray], stringType, { isVarargs: true }),
          ],
        }),
      ],
      overlays: [],
    });

    expect(result.dts).toContain("accept(arg0: (value: string) => void): void;");
    expect(result.dts).toContain("join(...arg0: string[]): string;");
  });

  test("renders bounded type parameters on classes and defaulted aliases", () => {
    const result = emit({
      pin,
      classes: [
        classModel("org.example.Box", "class", {
          typeParameters: [{ name: "T", bounds: [stringType] }],
        }),
      ],
      overlays: [],
    });

    expect(result.dts).toContain("export class Box<T extends string>");
    expect(result.dts).toContain("export type Box<T extends string = any> = org.example.Box<T>;");
  });

  test("records external arity for generic stubs", () => {
    const opaque: JType = { kind: "class", name: "com.example.Opaque", args: [stringType] };
    const result = emit({
      pin,
      classes: [
        classModel("org.example.UsesOpaque", "class", {
          methods: [method("opaque", [], opaque)],
        }),
      ],
      overlays: [],
    });

    expect(result.dts).toContain("opaque(): __paperExternal.com.example.Opaque<string>;");
    expect(result.dts).toContain("export interface Opaque<T0 = unknown> {}");
  });
});

describe("emit inheritance", () => {
  test("adds parent overloads for methods the class already declares", () => {
    const result = emit({
      pin,
      classes: [
        classModel("org.example.Parent", "class", {
          isAbstract: true,
          methods: [method("greet", [stringType], stringType, { isAbstract: true })],
        }),
        classModel("org.example.Kid", "class", {
          superClass: { kind: "class", name: "org.example.Parent", args: [] },
          methods: [method("greet", [objectType], stringType)],
        }),
      ],
      overlays: [],
    });

    expect(result.dts).toContain("export class Kid extends org.example.Parent {");
    expect(result.dts).toContain("greet(arg0: unknown): string;");
    expect(result.dts).toContain("greet(arg0: string): string;");
  });

  test("copies default interface methods into an implementing class", () => {
    const result = emit({
      pin,
      classes: [
        classModel("org.example.Defaults", "interface", {
          methods: [method("greet", [], stringType)],
        }),
        classModel("org.example.Impl", "class", {
          interfaces: [{ kind: "class", name: "org.example.Defaults", args: [] }],
        }),
      ],
      overlays: [],
    });

    expect(result.dts).toContain("export class Impl implements org.example.Defaults {");
    expect(result.dts).toContain("greet(): string;");
  });

  test("extends the first base and inlines members of a conflicting base", () => {
    const first: JType = { kind: "class", name: "org.example.First", args: [] };
    const second: JType = { kind: "class", name: "org.example.Second", args: [] };
    const result = emit({
      pin,
      classes: [
        classModel("org.example.First", "interface", {
          methods: [method("value", [], objectType, { isAbstract: true })],
        }),
        classModel("org.example.Second", "interface", {
          methods: [
            method("value", [], stringType, { isAbstract: true }),
            method("other", [], stringType, { isAbstract: true }),
          ],
        }),
        classModel("org.example.Combined", "interface", {
          interfaces: [first, second],
        }),
      ],
      overlays: [],
    });

    expect(result.dts).toContain("export interface Combined extends org.example.First {");
    expect(result.dts).toContain("value(): string;");
    expect(result.dts).toContain("other(): string;");
  });
});
