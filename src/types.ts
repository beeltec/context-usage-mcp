/**
 * Token usage as reported in an assistant message's `usage` block.
 * All fields are raw counts from the most recent API response (not cumulative).
 */
export type Usage = {
  readonly input_tokens: number;
  readonly cache_creation_input_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly output_tokens: number;
};

/**
 * The result of reading a session transcript.
 *
 * `context_tokens` is `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`
 * (output excluded — it is not part of the context fed back into the model).
 */
export type Reading =
  | {
      readonly available: true;
      readonly context_tokens: number;
      readonly breakdown: Usage;
      readonly session_id: string | null;
      readonly model: string | null;
      readonly timestamp: string | null;
    }
  | { readonly available: false; readonly reason: string };
