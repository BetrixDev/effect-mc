import asm from "@xmcl/asm";
import type { MethodVisitor as AsmMethodVisitor } from "@xmcl/asm";
import {
  classType,
  normalizeClassName,
  parseClassSignature,
  parseFieldDescriptor,
  parseFieldSignature,
  parseMethodDescriptor,
  parseMethodSignature,
  type JType,
  type JTypeParameter,
} from "./jvm.ts";

const { ClassReader, ClassVisitor, MethodVisitor, Opcodes } = asm;

export type ClassKind = "class" | "interface" | "enum" | "annotation";

export interface FieldModel {
  readonly name: string;
  readonly type: JType;
  readonly isStatic: boolean;
  readonly isFinal: boolean;
}

export interface ParameterModel {
  readonly name: string;
  readonly type: JType;
}

export interface MethodModel {
  readonly name: string;
  readonly typeParameters: ReadonlyArray<JTypeParameter>;
  readonly parameters: ReadonlyArray<ParameterModel>;
  readonly result: JType;
  readonly isStatic: boolean;
  readonly isAbstract: boolean;
  readonly isVarargs: boolean;
}

export interface ClassModel {
  /** Dotted binary name, e.g. `org.bukkit.entity.Player`. */
  readonly fqn: string;
  /** The Java package, which is also the namespace that holds the declaration. */
  readonly namespacePath: string;
  /** The name used inside `namespacePath`, e.g. `Player$SpawnCategory`. */
  readonly simpleName: string;
  readonly kind: ClassKind;
  readonly isAbstract: boolean;
  readonly typeParameters: ReadonlyArray<JTypeParameter>;
  readonly superClass: JType | undefined;
  readonly interfaces: ReadonlyArray<JType>;
  readonly fields: ReadonlyArray<FieldModel>;
  readonly methods: ReadonlyArray<MethodModel>;
  readonly constructors: ReadonlyArray<MethodModel>;
  readonly enumConstants: ReadonlyArray<string>;
}

const ACC_PUBLIC = Opcodes.ACC_PUBLIC;
const ACC_STATIC = Opcodes.ACC_STATIC;
const ACC_FINAL = Opcodes.ACC_FINAL;
const ACC_ABSTRACT = Opcodes.ACC_ABSTRACT;
const ACC_INTERFACE = Opcodes.ACC_INTERFACE;
const ACC_ANNOTATION = Opcodes.ACC_ANNOTATION;
const ACC_ENUM = Opcodes.ACC_ENUM;
const ACC_SYNTHETIC = Opcodes.ACC_SYNTHETIC;
const ACC_BRIDGE = Opcodes.ACC_BRIDGE;
const ACC_VARARGS = Opcodes.ACC_VARARGS;

interface RawField {
  readonly access: number;
  readonly name: string;
  readonly descriptor: string;
  readonly signature: string | null;
}

interface RawMethod {
  readonly access: number;
  readonly name: string;
  readonly descriptor: string;
  readonly signature: string | null;
  readonly parameterNames: ReadonlyArray<string | null>;
}

interface ReadOptions {
  readonly onWarning?: (message: string) => void;
}

class ParameterCapture extends MethodVisitor {
  readonly parameterNames: Array<string | null> = [];

  override visitParameter(name: string | null): void {
    this.parameterNames.push(name);
  }
}

class ModelVisitor extends ClassVisitor {
  binaryName = "";
  access = 0;
  signature: string | null = null;
  superName: string | null = null;
  interfaces: string[] = [];
  outerName: string | null = null;
  innerName: string | null = null;
  readonly fields: RawField[] = [];
  readonly methods: RawMethod[] = [];

  override visit(
    _version: number,
    access: number,
    name: string,
    signature: string | null,
    superName: string | null,
    interfaces: string[] | null,
  ): void {
    this.binaryName = name;
    this.access = access;
    this.signature = signature;
    this.superName = superName;
    this.interfaces = interfaces ?? [];
  }

  override visitInnerClass(name: string, outerName: string | null, innerName: string | null): void {
    if (name === this.binaryName) {
      this.outerName = outerName;
      this.innerName = innerName;
    }
  }

  override visitField(
    access: number,
    name: string,
    descriptor: string | null,
    signature: string | null,
  ): null {
    if (descriptor !== null) {
      this.fields.push({ access, name, descriptor, signature });
    }
    return null;
  }

  override visitMethod(
    access: number,
    name: string,
    descriptor: string,
    signature: string | null,
  ): AsmMethodVisitor {
    const visitor = new ParameterCapture(Opcodes.ASM5);
    this.methods.push({
      access,
      name,
      descriptor,
      signature,
      parameterNames: visitor.parameterNames,
    });
    return visitor;
  }
}

/** Reads one class file into the generator's model. */
export function readClass(bytes: Uint8Array, options: ReadOptions = {}): ClassModel | undefined {
  const visitor = readVisitor(bytes, options);
  if (visitor === undefined) {
    return undefined;
  }
  const identity = identifyClass(visitor);
  if (identity === undefined) {
    return undefined;
  }

  const binaryName = visitor.binaryName;
  const hierarchy = readHierarchy(visitor, options);
  const { enumConstants, fields } = readFields(visitor.fields, binaryName, options);
  const { methods, constructors } = readMethods(visitor.methods, binaryName, options);

  return {
    ...identity,
    isAbstract: (visitor.access & ACC_ABSTRACT) !== 0,
    ...hierarchy,
    fields,
    methods,
    constructors,
    enumConstants,
  };
}

function readVisitor(bytes: Uint8Array, options: ReadOptions): ModelVisitor | undefined {
  const visitor = new ModelVisitor(Opcodes.ASM5);
  try {
    new ClassReader(bytes).accept(visitor);
  } catch (error) {
    warn(options, `skipped unreadable class: ${String(error)}`);
    return undefined;
  }
  return visitor;
}

interface ClassIdentity {
  readonly fqn: string;
  readonly namespacePath: string;
  readonly simpleName: string;
  readonly kind: ClassKind;
}

/** Returns the declaration the class contributes, or skips it entirely. */
function identifyClass(visitor: ModelVisitor): ClassIdentity | undefined {
  const binaryName = visitor.binaryName;
  if (binaryName === "" || binaryName.endsWith("/package-info")) {
    return undefined;
  }
  if ((visitor.access & ACC_SYNTHETIC) !== 0) {
    return undefined;
  }
  if (visitor.innerName === null && visitor.outerName !== null) {
    return undefined;
  }
  if (visitor.innerName !== null && /^(?:\d+|lambda\$)/u.test(visitor.innerName)) {
    return undefined;
  }
  if ((visitor.access & ACC_PUBLIC) === 0) {
    return undefined;
  }
  if (binaryName.includes("$") && visitor.innerName === null) {
    // Anonymous and local classes carry no reusable name.
    return undefined;
  }

  return {
    fqn: normalizeClassName(binaryName),
    namespacePath: packageOf(binaryName),
    simpleName: lastSegment(binaryName),
    kind: classKind(visitor.access),
  };
}

function classKind(access: number): ClassKind {
  if ((access & ACC_ANNOTATION) !== 0) {
    return "annotation";
  }
  if ((access & ACC_ENUM) !== 0) {
    return "enum";
  }
  if ((access & ACC_INTERFACE) !== 0) {
    return "interface";
  }
  return "class";
}

interface Hierarchy {
  readonly typeParameters: ReadonlyArray<JTypeParameter>;
  readonly superClass: JType | undefined;
  readonly interfaces: ReadonlyArray<JType>;
}

/** Reads generic signatures, falling back to erased descriptors per class. */
function readHierarchy(visitor: ModelVisitor, options: ReadOptions): Hierarchy {
  let typeParameters: JTypeParameter[] = [];
  let superClass: JType | undefined;
  let interfaces: JType[] = [];

  if (visitor.signature !== null) {
    try {
      const parsed = parseClassSignature(visitor.signature);
      typeParameters = [...parsed.typeParameters];
      superClass = parsed.superClass;
      interfaces = [...parsed.interfaces];
    } catch (error) {
      warn(options, `class signature fallback for ${visitor.binaryName}: ${String(error)}`);
    }
  }

  return {
    typeParameters,
    superClass:
      superClass ??
      (visitor.superName === null ? undefined : classType(normalizeClassName(visitor.superName))),
    interfaces:
      interfaces.length === 0
        ? visitor.interfaces.map((name) => classType(normalizeClassName(name)))
        : interfaces,
  };
}

function readFields(
  fields: ReadonlyArray<RawField>,
  binaryName: string,
  options: ReadOptions,
): { enumConstants: string[]; fields: FieldModel[] } {
  const enumConstants: string[] = [];
  const models: FieldModel[] = [];
  for (const field of fields) {
    if ((field.access & ACC_PUBLIC) === 0 || (field.access & ACC_SYNTHETIC) !== 0) {
      continue;
    }
    if ((field.access & ACC_ENUM) !== 0) {
      enumConstants.push(field.name);
      continue;
    }
    models.push({
      name: field.name,
      type: readFieldType(field, binaryName, options),
      isStatic: (field.access & ACC_STATIC) !== 0,
      isFinal: (field.access & ACC_FINAL) !== 0,
    });
  }
  return { enumConstants, fields: models };
}

function readMethods(
  methods: ReadonlyArray<RawMethod>,
  binaryName: string,
  options: ReadOptions,
): { methods: MethodModel[]; constructors: MethodModel[] } {
  const models: MethodModel[] = [];
  const constructors: MethodModel[] = [];
  for (const method of methods) {
    if ((method.access & ACC_PUBLIC) === 0) {
      continue;
    }
    if ((method.access & ACC_SYNTHETIC) !== 0 || (method.access & ACC_BRIDGE) !== 0) {
      continue;
    }
    if (method.name === "<clinit>") {
      continue;
    }
    const parsed = readMethodType(method, binaryName, options);
    if (parsed === undefined) {
      continue;
    }
    const parameterNames = namesFor(method, parsed.parameters.length);
    const model: MethodModel = {
      name: method.name,
      typeParameters: parsed.typeParameters,
      parameters: parsed.parameters.map((type, index) => ({
        name: parameterNames[index] ?? `arg${index}`,
        type,
      })),
      result: parsed.result,
      isStatic: (method.access & ACC_STATIC) !== 0,
      isAbstract: (method.access & ACC_ABSTRACT) !== 0,
      isVarargs: (method.access & ACC_VARARGS) !== 0,
    };
    if (method.name === "<init>") {
      constructors.push(model);
    } else {
      models.push(model);
    }
  }
  return { methods: models, constructors };
}

function packageOf(binaryName: string): string {
  const index = binaryName.lastIndexOf("/");
  return index === -1 ? "" : binaryName.slice(0, index).replaceAll("/", ".");
}

function lastSegment(binaryName: string): string {
  return binaryName.slice(binaryName.lastIndexOf("/") + 1);
}

function readFieldType(field: RawField, binaryName: string, options: ReadOptions): JType {
  if (field.signature !== null) {
    try {
      return parseFieldSignature(field.signature);
    } catch (error) {
      warn(options, `field signature fallback for ${binaryName}.${field.name}: ${String(error)}`);
    }
  }
  return parseFieldDescriptor(field.descriptor);
}

function readMethodType(
  method: RawMethod,
  binaryName: string,
  options: ReadOptions,
): ReturnType<typeof parseMethodSignature> | undefined {
  if (method.signature !== null) {
    try {
      return parseMethodSignature(method.signature);
    } catch (error) {
      warn(options, `method signature fallback for ${binaryName}.${method.name}: ${String(error)}`);
    }
  }
  try {
    return parseMethodDescriptor(method.descriptor);
  } catch (error) {
    warn(options, `skipped method ${binaryName}.${method.name}: ${String(error)}`);
    return undefined;
  }
}

function namesFor(method: RawMethod, count: number): ReadonlyArray<string> {
  const used = new Set<string>();
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = sanitizeName(method.parameterNames[index] ?? `arg${index}`, index);
    let name = candidate;
    let suffix = 2;
    while (used.has(name)) {
      name = `${candidate}${suffix}`;
      suffix += 1;
    }
    used.add(name);
    names.push(name);
  }
  return names;
}

function sanitizeName(name: string, index: number): string {
  const trimmed = name.trim();
  if (trimmed === "" || !/^[A-Za-z_$][\w$]*$/u.test(trimmed)) {
    return `arg${index}`;
  }
  return trimmed;
}

function warn(options: ReadOptions, message: string): void {
  options.onWarning?.(message);
}
