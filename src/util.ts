/**
 * Normalize a caught value into a message string. `catch` binds `unknown`, so narrow to `Error`
 * before reading `.message`; otherwise stringify.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
