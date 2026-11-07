/** The dev loop writes progress and server output through this seam. */
export type Logger = (message: string) => void;

export const consoleLogger: Logger = (message) => {
  console.log(message);
};

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
