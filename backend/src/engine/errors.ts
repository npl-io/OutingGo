/** Error codes thrown by the routing/recommendation engine. */
export type EngineErrorCode =
  | 'MEMBER_OUT_OF_COVERAGE'
  | 'NOT_ENOUGH_MEMBERS'
  | 'GRAPH_NOT_LOADED'
  | 'INVALID_GRAPH_FILE';

/** An error produced by the engine; code identifies it for API consumers. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details: unknown;

  constructor(code: EngineErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}
