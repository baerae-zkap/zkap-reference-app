/**
 * Base error class for all application errors.
 * Provides a unified interface with error code, recoverability flag,
 * and optional original error for debugging.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
