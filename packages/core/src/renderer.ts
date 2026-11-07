import { Context, Layer } from "effect";

/**
 * A failure a boundary can render: a schema-tagged error, identified by its
 * `_tag`. Boundary code uses this structural shape rather than the class so a
 * host can render errors defined outside this package.
 */
export interface TaggedFailure {
  readonly _tag: string;
  readonly message?: string;
}

/** Whether a value is schema-tagged and therefore renderable by tag. */
export const isTaggedFailure = (value: unknown): value is TaggedFailure => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const tag = (value as { readonly _tag?: unknown })._tag;
  return typeof tag === "string" && tag.length > 0;
};

/** The message used when the renderer is handed a value it cannot identify. */
export const fallbackRenderMessage = "Something went wrong. Check the server log for details.";

const messageOf = (failure: TaggedFailure): string => {
  const message = typeof failure.message === "string" ? failure.message.trim() : "";
  return message.length > 0 ? message : `Something went wrong (${failure._tag}).`;
};

/**
 * The default renderer. It keeps `PermissionDenied` and `SenderNotPlayer`
 * distinct, because "you lack permission" and "the console cannot teleport"
 * have different fixes (ADR-0020). Every other tagged error renders its own
 * message, which keeps the author's wording intact.
 *
 * The output is a plain string: v0's `SenderValue.send` takes text, so the
 * Paper host is the one place that binds it to an Adventure component.
 */
export const defaultRenderer = {
  render: (failure: unknown): string => {
    if (isTaggedFailure(failure)) {
      switch (failure._tag) {
        case "PermissionDenied":
          return "You do not have permission to use this command.";
        case "SenderNotPlayer":
          return "This command can only be run by a player.";
        default:
          return messageOf(failure);
      }
    }
    return fallbackRenderMessage;
  },
} satisfies RendererService;

/**
 * Turns a failure into the message a boundary delivers to a sender. Swappable
 * through `PluginRuntimeOptions.renderer` or a test's harness options, so a
 * host controls presentation and a test asserts rendered output (ADR-0005).
 */
export interface RendererService {
  readonly render: (failure: unknown) => string;
}

/**
 * The renderer seam. The default layer is the Adventure-shaped text renderer;
 * a host or test supplies its own layer to replace it.
 */
export class Renderer extends Context.Service<Renderer, RendererService>()("effectmc/Renderer") {
  static readonly layer: Layer.Layer<Renderer> = Layer.succeed(Renderer, defaultRenderer);
}
