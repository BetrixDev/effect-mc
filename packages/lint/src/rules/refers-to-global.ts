import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

/**
 * Whether an identifier reads a global rather than a local binding. A property
 * key, import specifier, or declaration name is not a reference at all, and a
 * reference resolved to a declaration inside the file is local.
 *
 * This is deliberately a name-and-scope check, not a type check: the lint
 * package cannot see types (ADR-0018).
 */
export function refersToGlobal(sourceCode: SourceCode, node: ESTree.Node): boolean {
  if (node.type !== "Identifier") return false;

  const scope = sourceCode.getScope(node);
  const reference = scope.references.find((candidate) => candidate.identifier === node);
  if (reference === undefined) return false;

  return !reference.resolved?.defs.length;
}
