import type { FieldModel, MethodModel } from "./model.ts";
import { OBJECT_TYPE, type JClassType, type JType, type JTypeParameter } from "./jvm.ts";

export type RenderType = (type: JType) => string;

/**
 * Renders JVM types as TypeScript. Types outside the pinned artifact are
 * recorded as they are rendered so the caller can emit stubs for them.
 */
export interface TypeRenderer {
  readonly render: RenderType;
  /** Types outside the pinned artifact, mapped to the highest arity seen. */
  readonly external: ReadonlyMap<string, number>;
}

export function createTypeRenderer(arity: ReadonlyMap<string, number>): TypeRenderer {
  const external = new Map<string, number>();
  return {
    render: (type) => renderJType(type, arity, external),
    external,
  };
}

const UNKNOWN = "unknown";
const WILDCARD = "any";

const LIST_TYPES = new Set([
  "java.util.AbstractList",
  "java.util.ArrayList",
  "java.util.Deque",
  "java.util.LinkedList",
  "java.util.List",
  "java.util.Queue",
  "java.util.SequencedCollection",
  "java.util.Stack",
  "java.util.Vector",
]);

const COLLECTION_TYPES = new Set(["java.lang.Iterable", "java.util.Collection"]);

const SET_TYPES = new Set([
  "java.util.Set",
  "java.util.SortedSet",
  "java.util.NavigableSet",
  "java.util.HashSet",
  "java.util.LinkedHashSet",
  "java.util.TreeSet",
  "java.util.EnumSet",
  "java.util.AbstractSet",
]);

const MAP_TYPES = new Set([
  "java.util.Map",
  "java.util.SortedMap",
  "java.util.NavigableMap",
  "java.util.HashMap",
  "java.util.LinkedHashMap",
  "java.util.TreeMap",
  "java.util.EnumMap",
  "java.util.AbstractMap",
  "java.util.concurrent.ConcurrentMap",
]);

const BOXED_TYPES: Record<string, string> = {
  "java.lang.Boolean": "boolean",
  "java.lang.Byte": "number",
  "java.lang.Character": "string",
  "java.lang.Double": "number",
  "java.lang.Float": "number",
  "java.lang.Integer": "number",
  "java.lang.Long": "number",
  "java.lang.Number": "number",
  "java.lang.Short": "number",
};

function renderJType(
  type: JType,
  arity: ReadonlyMap<string, number>,
  external: Map<string, number>,
): string {
  switch (type.kind) {
    case "primitive":
      return primitive(type.name);
    case "void":
      return "void";
    case "typevar":
      return safeSegment(type.name);
    case "array":
      return arrayOf(renderJType(type.element, arity, external));
    case "wildcard":
      if (type.variance === "extends" && type.bound !== undefined) {
        return renderJType(type.bound, arity, external);
      }
      return WILDCARD;
    case "class":
      return renderClassType(type, arity, external);
  }
}

function renderClassType(
  type: JClassType,
  arity: ReadonlyMap<string, number>,
  external: Map<string, number>,
): string {
  const name = type.name;
  const args = type.args.map((argument) => renderJType(argument, arity, external));

  if (name === "java.lang.String" || name === "java.lang.CharSequence") {
    return "string";
  }
  if (name === "java.lang.Object" || name === "java.lang.Class") {
    return UNKNOWN;
  }
  if (name === "java.lang.Void") {
    return "void";
  }
  const boxed = BOXED_TYPES[name];
  if (boxed !== undefined) {
    return boxed;
  }
  if (LIST_TYPES.has(name)) {
    return `${wrapType(argument(args, 0))}[]`;
  }
  if (COLLECTION_TYPES.has(name)) {
    const element = argument(args, 0);
    return `${wrapType(element)}[] | ReadonlySet<${element}>`;
  }
  if (SET_TYPES.has(name)) {
    return `ReadonlySet<${argument(args, 0)}>`;
  }
  if (MAP_TYPES.has(name)) {
    return `ReadonlyMap<${argument(args, 0)}, ${argument(args, 1)}>`;
  }
  if (name === "java.util.Optional") {
    return `${wrapType(argument(args, 0))} | undefined`;
  }
  if (name === "java.util.concurrent.CompletableFuture") {
    return `Promise<${argument(args, 0)}>`;
  }
  const functionType = renderFunctionType(name, args);
  if (functionType !== undefined) {
    return functionType;
  }

  const expected = arity.get(name);
  if (expected !== undefined) {
    const padded = [...args];
    while (padded.length < expected) {
      padded.push(WILDCARD);
    }
    return `${safePath(name)}${renderTypeArguments(padded.slice(0, expected))}`;
  }

  external.set(name, Math.max(external.get(name) ?? 0, args.length));
  return `__paperExternal.${safePath(name)}${renderTypeArguments(args)}`;
}

function argument(args: ReadonlyArray<string>, index: number): string {
  return args[index] ?? UNKNOWN;
}

function renderFunctionType(name: string, args: ReadonlyArray<string>): string | undefined {
  switch (name) {
    case "java.util.function.Function":
      return `(value: ${argument(args, 0)}) => ${argument(args, 1)}`;
    case "java.util.function.BiFunction":
      return `(left: ${argument(args, 0)}, right: ${argument(args, 1)}) => ${argument(args, 2)}`;
    case "java.util.function.Predicate":
      return `(value: ${argument(args, 0)}) => boolean`;
    case "java.util.function.BiPredicate":
      return `(left: ${argument(args, 0)}, right: ${argument(args, 1)}) => boolean`;
    case "java.util.function.Consumer":
      return `(value: ${argument(args, 0)}) => void`;
    case "java.util.function.BiConsumer":
      return `(left: ${argument(args, 0)}, right: ${argument(args, 1)}) => void`;
    case "java.util.function.Supplier":
      return `() => ${argument(args, 0)}`;
    case "java.util.function.UnaryOperator":
      return `(value: ${argument(args, 0)}) => ${argument(args, 0)}`;
    case "java.util.function.BinaryOperator":
      return `(left: ${argument(args, 0)}, right: ${argument(args, 0)}) => ${argument(args, 0)}`;
    default:
      return undefined;
  }
}

function renderTypeArguments(args: ReadonlyArray<string>): string {
  if (args.length === 0) {
    return "";
  }
  return `<${args.join(", ")}>`;
}

export function renderTypeParameters(
  parameters: ReadonlyArray<JTypeParameter>,
  render: RenderType,
): string {
  return typeParameterList(parameters, render, false);
}

/** The argument list that instantiates a declaration's own type parameters. */
export function renderTypeParameterNames(parameters: ReadonlyArray<JTypeParameter>): string {
  if (parameters.length === 0) {
    return "";
  }
  return `<${parameters.map((parameter) => safeSegment(parameter.name)).join(", ")}>`;
}

/** Type parameter list for an alias, where every parameter needs a default. */
export function renderDefaultedTypeParameters(
  parameters: ReadonlyArray<JTypeParameter>,
  render: RenderType,
): string {
  return typeParameterList(parameters, render, true);
}

function typeParameterList(
  parameters: ReadonlyArray<JTypeParameter>,
  render: RenderType,
  defaulted: boolean,
): string {
  if (parameters.length === 0) {
    return "";
  }
  return `<${parameters
    .map((parameter) => renderTypeParameter(parameter, render, defaulted))
    .join(", ")}>`;
}

function renderTypeParameter(
  parameter: JTypeParameter,
  render: RenderType,
  defaulted: boolean,
): string {
  const name = safeSegment(parameter.name);
  const bounds = parameter.bounds
    .filter((bound) => !(bound.kind === "class" && bound.name === OBJECT_TYPE.name))
    .map((bound) => render(bound));
  if (bounds.length === 0) {
    return defaulted ? `${name} = any` : name;
  }
  const constraint = `${name} extends ${bounds.join(" & ")}`;
  return defaulted ? `${constraint} = any` : constraint;
}

export function renderField(field: FieldModel, render: RenderType): string {
  const staticPrefix = field.isStatic ? "static " : "";
  const readonly = field.isFinal ? "readonly " : "";
  return `${staticPrefix}${readonly}${safeMember(field.name)}: ${render(field.type)};`;
}

export function renderMethod(method: MethodModel, render: RenderType): string {
  return renderMethodLine(method, render, method.isStatic ? "static " : "");
}

/** A method line for a member position that never carries `static`. */
export function renderInstanceMethod(method: MethodModel, render: RenderType): string {
  return renderMethodLine(method, render, "");
}

function renderMethodLine(method: MethodModel, render: RenderType, prefix: string): string {
  const typeParameters = renderTypeParameters(method.typeParameters, render);
  return `${prefix}${safeMember(method.name)}${typeParameters}(${renderParameters(method, render)}): ${render(method.result)};`;
}

export function renderParameters(method: MethodModel, render: RenderType): string {
  const last = method.parameters.length - 1;
  return method.parameters
    .map((parameter, index) => {
      const type = render(parameter.type);
      if (index === last && method.isVarargs) {
        const arrayType = parameter.type.kind === "array" ? type : arrayOf(type);
        return `...${safeSegment(parameter.name)}: ${arrayType}`;
      }
      return `${safeSegment(parameter.name)}: ${type}`;
    })
    .join(", ");
}

function primitive(name: string): string {
  switch (name) {
    case "boolean":
      return "boolean";
    case "char":
      return "string";
    default:
      return "number";
  }
}

function wrapType(type: string): string {
  return type.includes("|") || type.includes("&") ? `(${type})` : type;
}

function arrayOf(type: string): string {
  return type.includes("|") || type.includes("&") || type.includes("=>")
    ? `(${type})[]`
    : `${type}[]`;
}

export function safeSegment(value: string): string {
  if (/^[A-Za-z_$][\w$]*$/u.test(value)) {
    return value;
  }
  return value.replaceAll(/[^\w$]/gu, "_");
}

export function safeMember(value: string): string {
  if (/^[A-Za-z_$][\w$]*$/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function safePath(value: string): string {
  return value
    .split(".")
    .filter((segment) => segment !== "")
    .map((segment) => safeSegment(segment))
    .join(".");
}

export function joinDeclaration(head: string, members: ReadonlyArray<string>): string {
  if (members.length === 0) {
    return `${head} {}`;
  }
  return `${head} {\n${indent(members).join("\n")}\n}`;
}

export function indent(lines: ReadonlyArray<string>): string[] {
  return lines.map((line) =>
    line === ""
      ? ""
      : line
          .split("\n")
          .map((part) => `  ${part}`)
          .join("\n"),
  );
}
