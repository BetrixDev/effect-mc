/**
 * @effectmc/commands
 *
 * The Brigadier-backed command surface: a declared tree of subcommands and
 * typed arguments, permission enforced at registration and execution, and
 * suggestions that run on the dispatch thread.
 */
export {
  Argument,
  type AnyCommandArgument,
  type ArgumentOptions,
  type ArgumentRecord,
  type CommandArgs,
  type CommandArgument,
  type CommandArgumentKind,
  type CommandArgumentType,
  type CommandInvocation,
  type CommandPermissionSubject,
  type CommandSource,
  type CommandSuggestion,
  type OptionalArgument,
  type PaperArgumentOptions,
  type RequiredArgument,
  type ResolveArgument,
  type SuggestionProvider,
} from "./argument";
export { Command, type AnyCommand } from "./command";
export {
  Commands,
  CommandRegistrar,
  type CommandNode,
  type CommandRegistrarService,
} from "./attach";
