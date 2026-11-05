/**
 * A parser for the JVM signature and descriptor grammars.
 *
 * The generator works from class files, so it has to understand both formats:
 * descriptors (erased types) and signatures (generics). The result is a small
 * type model that the emitter turns into TypeScript.
 */

export type PrimitiveName =
  | "boolean"
  | "byte"
  | "char"
  | "short"
  | "int"
  | "long"
  | "float"
  | "double";

export type JType =
  | { readonly kind: "primitive"; readonly name: PrimitiveName }
  | { readonly kind: "void" }
  | {
      readonly kind: "class";
      readonly name: string;
      readonly args: ReadonlyArray<JType>;
    }
  | { readonly kind: "array"; readonly element: JType }
  | { readonly kind: "typevar"; readonly name: string }
  | {
      readonly kind: "wildcard";
      readonly variance: "extends" | "super" | "unbounded";
      readonly bound?: JType;
    };

/** The class arm of `JType`, named so helpers can accept it directly. */
export type JClassType = Extract<JType, { kind: "class" }>;

export interface JTypeParameter {
  readonly name: string;
  readonly bounds: ReadonlyArray<JType>;
}

export function classType(name: string, args: ReadonlyArray<JType> = []): JClassType {
  return { kind: "class", name, args };
}

export const OBJECT_TYPE: JClassType = classType("java.lang.Object");

export interface JClassSignature {
  readonly typeParameters: ReadonlyArray<JTypeParameter>;
  readonly superClass: JType;
  readonly interfaces: ReadonlyArray<JType>;
}

export interface JMethodSignature {
  readonly typeParameters: ReadonlyArray<JTypeParameter>;
  readonly parameters: ReadonlyArray<JType>;
  readonly result: JType;
}

const PRIMITIVES: Record<string, PrimitiveName> = {
  B: "byte",
  C: "char",
  D: "double",
  F: "float",
  I: "int",
  J: "long",
  S: "short",
  Z: "boolean",
};

const NAME_END = new Set([";", "<", ".", ">", ":", "^"]);

class Cursor {
  private index = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  get done(): boolean {
    return this.index >= this.text.length;
  }

  peek(): string {
    return this.text[this.index] ?? "";
  }

  take(): string {
    const value = this.text[this.index];
    if (value === undefined) {
      throw new Error(`Unexpected end of signature: ${this.text}`);
    }
    this.index += 1;
    return value;
  }

  expect(value: string): void {
    const actual = this.take();
    if (actual !== value) {
      throw new Error(
        `Expected ${JSON.stringify(value)} in signature ${JSON.stringify(this.text)}, found ${JSON.stringify(actual)}`,
      );
    }
  }

  readUntil(value: string): string {
    let result = "";
    while (!this.done && this.peek() !== value) {
      result += this.take();
    }
    return result;
  }

  readName(): string {
    let result = "";
    while (!this.done && !NAME_END.has(this.peek())) {
      result += this.take();
    }
    return result;
  }

  remaining(): string {
    return this.text.slice(this.index);
  }
}

/** Normalizes a JVM internal name (`a/b/C$D`) to a dotted name (`a.b.C$D`). */
export function normalizeClassName(name: string): string {
  return name.replaceAll("/", ".");
}

export function parseFieldDescriptor(descriptor: string): JType {
  const cursor = new Cursor(descriptor);
  const type = parseFieldType(cursor);
  if (!cursor.done) {
    throw new Error(`Trailing data in field descriptor: ${descriptor}`);
  }
  return type;
}

export function parseMethodDescriptor(descriptor: string): JMethodSignature {
  const cursor = new Cursor(descriptor);
  cursor.expect("(");
  const parameters: JType[] = [];
  while (cursor.peek() !== ")") {
    parameters.push(parseFieldType(cursor));
  }
  cursor.expect(")");
  const result = parseJavaType(cursor);
  if (!cursor.done) {
    throw new Error(`Trailing data in method descriptor: ${descriptor}`);
  }
  return { typeParameters: [], parameters, result };
}

export function parseFieldSignature(signature: string): JType {
  const cursor = new Cursor(signature);
  const type = parseFieldType(cursor);
  if (!cursor.done) {
    throw new Error(`Trailing data in field signature: ${signature}`);
  }
  return type;
}

export function parseClassSignature(signature: string): JClassSignature {
  const cursor = new Cursor(signature);
  const typeParameters = parseTypeParameters(cursor);
  const superClass = parseJavaType(cursor);
  const interfaces: JType[] = [];
  while (!cursor.done) {
    interfaces.push(parseJavaType(cursor));
  }
  return { typeParameters, superClass, interfaces };
}

export function parseMethodSignature(signature: string): JMethodSignature {
  const cursor = new Cursor(signature);
  const typeParameters = parseTypeParameters(cursor);
  cursor.expect("(");
  const parameters: JType[] = [];
  while (cursor.peek() !== ")") {
    parameters.push(parseFieldType(cursor));
  }
  cursor.expect(")");
  const result = parseJavaType(cursor);
  while (cursor.peek() === "^") {
    cursor.take();
    parseJavaType(cursor);
  }
  if (!cursor.done) {
    throw new Error(`Trailing data in method signature: ${signature}`);
  }
  return { typeParameters, parameters, result };
}

function parseTypeParameters(cursor: Cursor): JTypeParameter[] {
  if (cursor.peek() !== "<") {
    return [];
  }
  cursor.take();
  const parameters: JTypeParameter[] = [];
  while (cursor.peek() !== ">") {
    const name = cursor.readUntil(":");
    cursor.expect(":");
    const bounds: JType[] = [];
    while (isFieldTypeStart(cursor.peek()) && !looksLikeTypeParameter(cursor)) {
      bounds.push(parseFieldType(cursor));
    }
    if (cursor.peek() === ":") {
      cursor.take();
      while (isFieldTypeStart(cursor.peek()) && !looksLikeTypeParameter(cursor)) {
        bounds.push(parseFieldType(cursor));
      }
    }
    parameters.push({ name, bounds });
  }
  cursor.expect(">");
  return parameters;
}

function parseJavaType(cursor: Cursor): JType {
  const tag = cursor.take();
  if (tag === "V") {
    return { kind: "void" };
  }
  const primitive = PRIMITIVES[tag];
  if (primitive !== undefined) {
    return { kind: "primitive", name: primitive };
  }
  if (tag === "[") {
    return { kind: "array", element: parseJavaType(cursor) };
  }
  if (tag === "T") {
    const name = cursor.readUntil(";");
    cursor.expect(";");
    return { kind: "typevar", name };
  }
  if (tag === "L") {
    return parseClassType(cursor);
  }
  throw new Error(`Unknown signature tag ${JSON.stringify(tag)}`);
}

function parseFieldType(cursor: Cursor): JType {
  const type = parseJavaType(cursor);
  if (type.kind === "void") {
    throw new Error("void is not a field type");
  }
  return type;
}

function parseClassType(cursor: Cursor): JType {
  let name = cursor.readName();
  let args = parseTypeArgumentsIfPresent(cursor);
  while (cursor.peek() === ".") {
    cursor.take();
    name += `$${cursor.readName()}`;
    args = parseTypeArgumentsIfPresent(cursor);
  }
  cursor.expect(";");
  return {
    kind: "class",
    name: normalizeClassName(name),
    args,
  };
}

function parseTypeArgumentsIfPresent(cursor: Cursor): JType[] {
  if (cursor.peek() !== "<") {
    return [];
  }
  cursor.take();
  const args: JType[] = [];
  while (cursor.peek() !== ">") {
    const variance = cursor.peek();
    if (variance === "*") {
      cursor.take();
      args.push({ kind: "wildcard", variance: "unbounded" });
    } else if (variance === "+" || variance === "-") {
      cursor.take();
      args.push({
        kind: "wildcard",
        variance: variance === "+" ? "extends" : "super",
        bound: parseFieldType(cursor),
      });
    } else {
      args.push(parseFieldType(cursor));
    }
  }
  cursor.expect(">");
  return args;
}

function isFieldTypeStart(tag: string): boolean {
  return tag === "L" || tag === "[" || tag === "T" || tag in PRIMITIVES;
}

/**
 * `<T:Ljava/lang/Object;V:Ljava/lang/Object;>` has no separator between type
 * parameters. A bare `V` after a bound is the next parameter's name, not the
 * void type, so stop before an `Identifier:` lookahead.
 */
function looksLikeTypeParameter(cursor: Cursor): boolean {
  return /^[A-Za-z_$][\w$]*:/u.test(cursor.remaining());
}
