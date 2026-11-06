/**
 * How an attachment is registered and how a dispatch actually runs. The mode is
 * explicit because an event class cannot tell you where it will run:
 * `AsyncChatEvent` sometimes fires synchronously (ADR-0012).
 */
export const eventModes = ["sync", "async"] as const;

export type EventMode = (typeof eventModes)[number];
