import { collectInterfaceMembers, interfaceMethods, superOverloads } from "./inheritance.ts";
import type { ClassModel, FieldModel, MethodModel } from "./model.ts";
import { OBJECT_TYPE, type JType } from "./jvm.ts";
import {
  joinDeclaration,
  renderField,
  renderInstanceMethod,
  renderMethod,
  renderParameters,
  renderTypeParameters,
  safeMember,
  safeSegment,
  type RenderType,
} from "./render.ts";
import { compareStrings } from "./sort.ts";

export interface DeclarationContext {
  readonly classes: ReadonlyMap<string, ClassModel>;
  /** Method names each declaration inherits and therefore does not repeat. */
  readonly inherited: ReadonlyMap<string, ReadonlySet<string>>;
}

interface RenderedMembers {
  readonly lines: string[];
  readonly methods: string[];
}

const NO_METHODS: ReadonlySet<string> = new Set();

/** Renders one class, interface, or enum declaration. */
export function renderDeclaration(
  model: ClassModel,
  context: DeclarationContext,
  render: RenderType,
): string {
  const name = `${safeSegment(model.simpleName)}${renderTypeParameters(model.typeParameters, render)}`;
  switch (model.kind) {
    case "interface":
    case "annotation":
      return renderInterfaceDeclaration(model, name, context, render);
    case "enum":
      return renderEnumDeclaration(model, name, context, render);
    case "class":
      return renderClassDeclaration(model, name, context, render);
  }
}

function renderInterfaceDeclaration(
  model: ClassModel,
  name: string,
  context: DeclarationContext,
  render: RenderType,
): string {
  const skipped = context.inherited.get(model.fqn) ?? NO_METHODS;
  const own = renderInterfaceMembers(model, render, skipped);
  const { bases, merged } = mergeInterfaceBases(model, own, skipped, context, render);
  const extension =
    bases.length > 0 ? ` extends ${bases.map((base) => render(base)).join(", ")}` : "";
  return joinDeclaration(`export interface ${name}${extension}`, [...own.lines, ...merged]);
}

/**
 * Keeps a direct base in `extends` unless it redeclares a member with a
 * different shape, which TypeScript rejects. Conflicting bases are copied in
 * as members instead, so Java's covariant overrides stay representable.
 */
function mergeInterfaceBases(
  model: ClassModel,
  own: RenderedMembers,
  skipped: ReadonlySet<string>,
  context: DeclarationContext,
  render: RenderType,
): { bases: JType[]; merged: string[] } {
  const bases: JType[] = [];
  const merged: string[] = [];
  const methodLines = new Set(own.methods);
  const methodNames = new Set(
    model.methods
      .filter((method) => !method.isStatic && !skipped.has(method.name))
      .map((method) => method.name),
  );
  const fieldNames = new Set(
    model.fields.filter((field) => !field.isStatic).map((field) => field.name),
  );

  for (const base of model.interfaces) {
    if (!isGeneratedInterface(base, context.classes)) {
      continue;
    }
    const members = collectInterfaceMembers(base, new Map(), context.classes, render);
    const conflicts =
      members.methods.some((member) => methodNames.has(member.name)) ||
      members.fields.some((member) => fieldNames.has(member.name));
    if (bases.length === 0 || !conflicts) {
      bases.push(base);
      for (const member of members.methods) {
        methodLines.add(member.line);
        methodNames.add(member.name);
      }
      for (const member of members.fields) {
        fieldNames.add(member.name);
      }
      continue;
    }
    for (const member of members.fields) {
      if (fieldNames.has(member.name)) {
        continue;
      }
      fieldNames.add(member.name);
      merged.push(member.line);
    }
    for (const member of members.methods) {
      if (methodLines.has(member.line)) {
        continue;
      }
      methodLines.add(member.line);
      methodNames.add(member.name);
      merged.push(member.line);
    }
  }

  return { bases, merged };
}

function renderEnumDeclaration(
  model: ClassModel,
  name: string,
  context: DeclarationContext,
  render: RenderType,
): string {
  const interfaces = model.interfaces
    .filter((type) => isGeneratedInterface(type, context.classes))
    .map((type) => render(type));
  const implementation = interfaces.length > 0 ? ` implements ${interfaces.join(", ")}` : "";
  const members: string[] = ["private constructor();"];
  for (const constant of [...model.enumConstants].sort(compareStrings)) {
    members.push(`static readonly ${safeMember(constant)}: ${name};`);
  }
  members.push(...renderClassMembers(model, render, NO_METHODS, "none").lines);
  members.push(
    ...interfaceMethods(model, context.classes, render, presentMemberNames(model, NO_METHODS)),
  );
  return joinDeclaration(`export class ${name}${implementation}`, members);
}

function renderClassDeclaration(
  model: ClassModel,
  name: string,
  context: DeclarationContext,
  render: RenderType,
): string {
  const extension = superClassExtension(model, context.classes, render);
  const interfaces = model.interfaces
    .filter((type) => isGeneratedInterface(type, context.classes))
    .map((type) => render(type));
  const implementation = interfaces.length > 0 ? ` implements ${interfaces.join(", ")}` : "";
  const skipped = context.inherited.get(model.fqn) ?? NO_METHODS;
  const members = renderClassMembers(model, render, skipped, "protected");
  const inheritedLines = interfaceMethods(
    model,
    context.classes,
    render,
    presentMemberNames(model, skipped),
  );
  members.lines.push(...inheritedLines);
  const existingMethods = new Set([...members.methods, ...inheritedLines]);
  members.lines.push(...superOverloads(model, context.classes, render, existingMethods));
  const prefix = model.isAbstract ? "export abstract class" : "export class";
  return joinDeclaration(`${prefix} ${name}${extension}${implementation}`, members.lines);
}

function superClassExtension(
  model: ClassModel,
  classes: ReadonlyMap<string, ClassModel>,
  render: RenderType,
): string {
  const superClass = model.superClass;
  if (superClass === undefined || superClass.kind !== "class") {
    return "";
  }
  if (superClass.name === OBJECT_TYPE.name || superClass.name === "java.lang.Enum") {
    return "";
  }
  if (!classes.has(superClass.name)) {
    return "";
  }
  return ` extends ${render(superClass)}`;
}

function renderInterfaceMembers(
  model: ClassModel,
  render: RenderType,
  skippedMethods: ReadonlySet<string>,
): RenderedMembers {
  const lines: string[] = [];
  const methods: string[] = [];
  for (const field of model.fields) {
    if (field.isStatic) {
      continue;
    }
    lines.push(
      `${field.isFinal ? "readonly " : ""}${safeMember(field.name)}: ${render(field.type)};`,
    );
  }
  for (const method of model.methods) {
    if (method.isStatic || skippedMethods.has(method.name)) {
      continue;
    }
    const line = renderInstanceMethod(method, render);
    lines.push(line);
    methods.push(line);
  }
  return { lines, methods };
}

/** Static fields and methods of an interface live in a same-named namespace. */
export function renderInterfaceStatics(model: ClassModel, render: RenderType): string[] {
  const lines: string[] = [];
  for (const field of model.fields) {
    if (!field.isStatic) {
      continue;
    }
    lines.push(`export const ${safeMember(field.name)}: ${render(field.type)};`);
  }
  for (const method of model.methods) {
    if (!method.isStatic) {
      continue;
    }
    lines.push(`export function ${renderInstanceMethod(method, render)}`);
  }
  return lines;
}

function renderClassMembers(
  model: ClassModel,
  render: RenderType,
  skippedMethods: ReadonlySet<string>,
  implicitConstructor: "protected" | "none",
): RenderedMembers {
  const lines: string[] = [];
  const methods: string[] = [];
  const seen = new Set<string>();
  const push = (line: string, isMethod: boolean): void => {
    if (seen.has(line)) {
      return;
    }
    seen.add(line);
    lines.push(line);
    if (isMethod) {
      methods.push(line);
    }
  };

  for (const field of [...model.fields].sort(compareFields)) {
    push(renderField(field, render), false);
  }
  for (const line of renderConstructors(model, render, implicitConstructor)) {
    push(line, false);
  }
  for (const method of [...model.methods].sort(compareMethods)) {
    if (skippedMethods.has(method.name)) {
      continue;
    }
    push(renderMethod(method, render), true);
  }

  return { lines, methods };
}

function renderConstructors(
  model: ClassModel,
  render: RenderType,
  implicitConstructor: "protected" | "none",
): string[] {
  if (model.constructors.length === 0) {
    // A package-private constructor is not in the generated API. Keep the
    // class non-constructable without closing the door on generated subclasses.
    return implicitConstructor === "protected" ? ["protected constructor();"] : [];
  }
  return [...model.constructors]
    .sort(compareMethods)
    .map((constructor) => `constructor(${renderParameters(constructor, render)});`);
}

function presentMemberNames(model: ClassModel, inherited: ReadonlySet<string>): Set<string> {
  const names = new Set<string>(inherited);
  for (const field of model.fields) {
    names.add(field.name);
  }
  for (const method of model.methods) {
    names.add(method.name);
  }
  for (const constant of model.enumConstants) {
    names.add(constant);
  }
  return names;
}

function isGeneratedInterface(type: JType, classes: ReadonlyMap<string, ClassModel>): boolean {
  if (type.kind !== "class") {
    return false;
  }
  return classes.get(type.name)?.kind === "interface";
}

function compareFields(left: FieldModel, right: FieldModel): number {
  return compareStrings(left.name, right.name);
}

function compareMethods(left: MethodModel, right: MethodModel): number {
  const leftKey = `${left.name}(${left.parameters.map((parameter) => parameter.type.kind).join(",")})`;
  const rightKey = `${right.name}(${right.parameters.map((parameter) => parameter.type.kind).join(",")})`;
  return compareStrings(leftKey, rightKey);
}
