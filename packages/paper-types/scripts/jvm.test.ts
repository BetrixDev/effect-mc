import { describe, expect, test } from "vite-plus/test";
import {
  normalizeClassName,
  parseClassSignature,
  parseFieldDescriptor,
  parseFieldSignature,
  parseMethodDescriptor,
  parseMethodSignature,
} from "./jvm.ts";

describe("JVM descriptors", () => {
  test("parses primitive, class, and array method parameters", () => {
    const parsed = parseMethodDescriptor("(ILjava/lang/String;[Lorg/bukkit/entity/Player;)V");
    expect(parsed.parameters).toEqual([
      { kind: "primitive", name: "int" },
      { kind: "class", name: "java.lang.String", args: [] },
      {
        kind: "array",
        element: { kind: "class", name: "org.bukkit.entity.Player", args: [] },
      },
    ]);
    expect(parsed.result).toEqual({ kind: "void" });
  });

  test("parses field descriptors", () => {
    expect(parseFieldDescriptor("[Ljava/util/UUID;")).toEqual({
      kind: "array",
      element: { kind: "class", name: "java.util.UUID", args: [] },
    });
  });
});

describe("JVM signatures", () => {
  test("parses a class signature with two type parameters", () => {
    const parsed = parseClassSignature(
      "<K:Ljava/lang/Object;V:Ljava/lang/Object;>Ljava/util/AbstractMap<TK;TV;>;",
    );
    expect(parsed.typeParameters.map((parameter) => parameter.name)).toEqual(["K", "V"]);
    expect(parsed.superClass).toEqual({
      kind: "class",
      name: "java.util.AbstractMap",
      args: [
        { kind: "typevar", name: "K" },
        { kind: "typevar", name: "V" },
      ],
    });
  });

  test("parses a generic method signature", () => {
    const parsed = parseMethodSignature("<T:Ljava/lang/Object;>(Ljava/util/List<TT;>;)TT;");
    expect(parsed.typeParameters[0]?.name).toBe("T");
    expect(parsed.parameters[0]).toEqual({
      kind: "class",
      name: "java.util.List",
      args: [{ kind: "typevar", name: "T" }],
    });
    expect(parsed.result).toEqual({ kind: "typevar", name: "T" });
  });

  test("parses wildcard and inner-class signatures", () => {
    const wildcard = parseFieldSignature("Ljava/util/List<+Ljava/lang/Number;>;");
    expect(wildcard).toEqual({
      kind: "class",
      name: "java.util.List",
      args: [
        {
          kind: "wildcard",
          variance: "extends",
          bound: { kind: "class", name: "java.lang.Number", args: [] },
        },
      ],
    });

    const inner = parseFieldSignature("Ljava/util/Map$Entry<TK;TV;>;");
    expect(inner.kind).toBe("class");
    if (inner.kind === "class") {
      expect(inner.name).toBe("java.util.Map$Entry");
      expect(inner.args).toHaveLength(2);
    }
  });
});

test("normalizes internal names without flattening nested classes", () => {
  expect(normalizeClassName("org/bukkit/event/Event$Result")).toBe("org.bukkit.event.Event$Result");
});
