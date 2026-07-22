/** Structured Host error codes (architecture §7.3). */
export type HostErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_TRUSTED"
  | "SESSION_BUSY"
  | "SESSION_NOT_FOUND"
  | "AGENT_CRASHED"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED_CAPABILITY"
  | "IO_ERROR"
  | "INTERNAL"
  | "NOT_ATTACHED"
  | "BINARY_NOT_FOUND"
  | "TIMEOUT"
  | "INVALID_ARGUMENT"
  /** User / host cancelled an in-flight ACP request (e.g. session/prompt) */
  | "CANCELLED";

export class HostError extends Error {
  readonly code: HostErrorCode;
  readonly details?: unknown;

  constructor(code: HostErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HostError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isHostError(err: unknown): err is HostError {
  return err instanceof HostError;
}
