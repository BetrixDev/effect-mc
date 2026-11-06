import { Schema } from "effect";
import { registrationKinds } from "@effectmc/core";

/**
 * Raised by the harness when a plugin program is still running after its
 * deadline. A program must be finite (ADR-0002); a test should fail with the
 * reason instead of hanging.
 */
export class ProgramDidNotComplete extends Schema.TaggedError<ProgramDidNotComplete>()(
  "ProgramDidNotComplete",
  {
    plugin: Schema.String,
    timeoutMillis: Schema.Number,
    message: Schema.String,
  },
) {}

/**
 * Raised by `TestHarness.teardown` when the Registry still held registrations
 * at the moment teardown cleared it. Runtime teardown is supposed to detach
 * everything through the scope, so a leftover entry means the plugin leaked a
 * registration past its lifetime (ADR-0021).
 */
export class LeakedRegistrations extends Schema.TaggedError<LeakedRegistrations>()(
  "LeakedRegistrations",
  {
    plugin: Schema.String,
    registrations: Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(registrationKinds),
        name: Schema.String,
      }),
    ),
    message: Schema.String,
  },
) {}
