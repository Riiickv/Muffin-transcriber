// Normalizes a thrown value (Error, plain object, string, etc.) into a
// user-displayable message. Used by every catch site that feeds dialog.show.
export function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
