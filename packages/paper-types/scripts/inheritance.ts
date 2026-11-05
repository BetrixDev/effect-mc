import { OBJECT_TYPE, type JClassType, type JType } from "./jvm.ts";
import type { ClassModel, MethodModel } from "./model.ts";
import { renderInstanceMethod, renderMethod, safeMember, type RenderType } from "./render.ts";
import { compareStrings } from "./sort.ts";

export type Substitution = ReadonlyMap<string, JType>;

export interface InheritedMember {
  readonly name: string;
  readonly line: string;
}

export interface InterfaceMembers {
  readonly fields: ReadonlyArray<InheritedMember>;
  readonly methods: ReadonlyArray<InheritedMember>;
}

/**
 * Method names each declaration inherits, so an owned declaration is not
 * repeated. Interface defaults count; abstract class methods do not.
 */
export function inheritedMethodNames(
  classes: ReadonlyMap<string, ClassModel>,
): Map<string, Set<string>> {
  const cache = new Map<string, Set<string>>();
  const visiting = new Set<string>();

  const visit = (model: ClassModel): Set<string> => {
    const cached = cache.get(model.fqn);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(model.fqn)) {
      return new Set();
    }
    visiting.add(model.fqn);
    const names = new Set<string>();
    for (const parent of parentsOf(model, classes)) {
      for (const name of visit(parent)) {
        names.add(name);
      }
      for (const method of parent.methods) {
        if (isInterface(model) || !method.isAbstract) {
          names.add(method.name);
        }
      }
    }
    visiting.delete(model.fqn);
    cache.set(model.fqn, names);
    return names;
  };

  for (const model of classes.values()) {
    visit(model);
  }
  return cache;
}

function parentsOf(model: ClassModel, classes: ReadonlyMap<string, ClassModel>): ClassModel[] {
  if (isInterface(model)) {
    const parents: ClassModel[] = [];
    for (const type of model.interfaces) {
      if (type.kind !== "class") {
        continue;
      }
      const parent = classes.get(type.name);
      if (parent?.kind === "interface") {
        parents.push(parent);
      }
    }
    return parents;
  }

  if (model.superClass?.kind !== "class") {
    return [];
  }
  const parent = classes.get(model.superClass.name);
  return parent === undefined ? [] : [parent];
}

/**
 * Every field and method an interface contributes, including inherited ones,
 * with type arguments substituted into the declaring interface's parameters.
 */
export function collectInterfaceMembers(
  type: JType,
  substitution: Substitution,
  classes: ReadonlyMap<string, ClassModel>,
  render: RenderType,
): InterfaceMembers {
  const fields: InheritedMember[] = [];
  const methods: InheritedMember[] = [];
  const fieldNames = new Set<string>();
  const methodLines = new Set<string>();

  const visit = (current: JType, outer: Substitution): void => {
    if (current.kind !== "class") {
      return;
    }
    const parent = classes.get(current.name);
    if (parent === undefined || !isInterface(parent)) {
      return;
    }
    const local = bindTypeArguments(current, parent, outer);
    for (const field of parent.fields) {
      if (field.isStatic || fieldNames.has(field.name)) {
        continue;
      }
      fieldNames.add(field.name);
      fields.push({
        name: field.name,
        line: `readonly ${safeMember(field.name)}: ${render(substituteType(field.type, local))};`,
      });
    }
    for (const method of parent.methods) {
      if (method.isStatic) {
        continue;
      }
      const line = renderMethod(substituteMethod(method, local), render);
      if (!methodLines.has(line)) {
        methodLines.add(line);
        methods.push({ name: method.name, line });
      }
    }
    for (const base of parent.interfaces) {
      visit(base, local);
    }
  };

  visit(type, substitution);
  return { fields, methods };
}

/**
 * Non-static interface methods a class or enum inherits and does not declare
 * itself. Abstract inherited methods are skipped; default methods are copied
 * in because a TypeScript class does not inherit an interface body.
 */
export function interfaceMethods(
  model: ClassModel,
  classes: ReadonlyMap<string, ClassModel>,
  render: RenderType,
  memberNames: ReadonlySet<string>,
): string[] {
  const methods: string[] = [];
  const present = new Set(memberNames);

  const visit = (type: JType, outer: Substitution): void => {
    if (type.kind !== "class") {
      return;
    }
    const parent = classes.get(type.name);
    if (parent === undefined || !isInterface(parent)) {
      return;
    }
    const local = bindTypeArguments(type, parent, outer);
    const blocked = new Set(present);
    const addedHere = new Set<string>();
    for (const method of parent.methods) {
      if (method.isStatic) {
        continue;
      }
      if (method.isAbstract) {
        if (present.has(method.name)) {
          continue;
        }
      } else if (blocked.has(method.name) && !addedHere.has(method.name)) {
        continue;
      }
      methods.push(renderInstanceMethod(substituteMethod(method, local), render));
      present.add(method.name);
      addedHere.add(method.name);
    }
    for (const base of parent.interfaces) {
      visit(base, local);
    }
  };

  for (const type of model.interfaces) {
    visit(type, new Map());
  }

  return methods.sort(compareStrings);
}

/** Parent overloads of methods this class already declares. */
export function superOverloads(
  model: ClassModel,
  classes: ReadonlyMap<string, ClassModel>,
  render: RenderType,
  declaredLines: ReadonlySet<string>,
): string[] {
  const output: string[] = [];
  const ownNames = new Set(model.methods.map((method) => method.name));
  const existing = new Set(declaredLines);

  const visit = (type: JType, outer: Substitution): void => {
    if (type.kind !== "class") {
      return;
    }
    const parent = classes.get(type.name);
    if (parent === undefined || parent.kind !== "class") {
      return;
    }
    const local = bindTypeArguments(type, parent, outer);
    for (const method of parent.methods) {
      if (!ownNames.has(method.name)) {
        continue;
      }
      const line = renderMethod(substituteMethod(method, local), render);
      if (!existing.has(line)) {
        existing.add(line);
        output.push(line);
      }
    }
    for (const base of parent.interfaces) {
      for (const member of collectInterfaceMembers(base, local, classes, render).methods) {
        if (!ownNames.has(member.name) || existing.has(member.line)) {
          continue;
        }
        existing.add(member.line);
        output.push(member.line);
      }
    }
    if (parent.superClass !== undefined) {
      visit(parent.superClass, local);
    }
  };

  if (model.superClass !== undefined) {
    visit(model.superClass, new Map());
  }
  return output.sort(compareStrings);
}

export function substituteMethod(method: MethodModel, substitution: Substitution): MethodModel {
  const shadowed = new Set(method.typeParameters.map((parameter) => parameter.name));
  const effective = new Map([...substitution.entries()].filter(([name]) => !shadowed.has(name)));
  return {
    ...method,
    typeParameters: method.typeParameters.map((parameter) => ({
      ...parameter,
      bounds: parameter.bounds.map((bound) => substituteType(bound, effective)),
    })),
    parameters: method.parameters.map((parameter) => ({
      ...parameter,
      type: substituteType(parameter.type, effective),
    })),
    result: substituteType(method.result, effective),
  };
}

export function substituteType(type: JType, substitution: Substitution): JType {
  switch (type.kind) {
    case "typevar":
      return substitution.get(type.name) ?? type;
    case "array":
      return {
        kind: "array",
        element: substituteType(type.element, substitution),
      };
    case "class":
      return {
        ...type,
        args: type.args.map((argument) => substituteType(argument, substitution)),
      };
    case "wildcard":
      return type.bound === undefined
        ? type
        : { ...type, bound: substituteType(type.bound, substitution) };
    case "primitive":
    case "void":
      return type;
  }
}

/**
 * Binds one class's type parameters to the arguments at a use site. Arguments
 * are resolved in the outer scope; the new bindings apply to the class body.
 */
function bindTypeArguments(
  type: JClassType,
  parent: ClassModel,
  outer: Substitution,
): Map<string, JType> {
  const local = new Map(outer);
  parent.typeParameters.forEach((parameter, index) => {
    const argument = type.args[index] ?? OBJECT_TYPE;
    local.set(parameter.name, substituteType(argument, outer));
  });
  return local;
}

function isInterface(model: ClassModel): boolean {
  return model.kind === "interface" || model.kind === "annotation";
}
