import type { NextFunction, Request, Response } from "express";

/**
 * Application error carrying an HTTP status + machine-readable code.
 * Thrown anywhere in a handler/service and translated by the error middleware.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(401, "unauthorized", message);
  }
  static forbidden(message = "You do not have permission to do that") {
    return new AppError(403, "forbidden", message);
  }
  static notFound(message = "Not found") {
    return new AppError(404, "not_found", message);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, "conflict", message, details);
  }
  static locked(message = "This record is locked") {
    return new AppError(423, "locked", message);
  }
  static unprocessable(message: string, details?: unknown) {
    return new AppError(422, "unprocessable", message, details);
  }
}

/** Wrap an async Express handler so thrown/rejected errors reach next(). */
export function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
