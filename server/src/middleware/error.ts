import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { isProd } from "../env";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: {
          code: "conflict",
          message: "A record with that unique value already exists",
          details: err.meta,
        },
      });
    }
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ error: { code: "not_found", message: "Record not found" } });
    }
  }

  // Unknown — log server-side, return a generic 500.
  // eslint-disable-next-line no-console
  console.error("[unhandled error]", err);
  return res.status(500).json({
    error: {
      code: "internal_error",
      message: "Something went wrong",
      ...(isProd ? {} : { detail: String((err as Error)?.message ?? err) }),
    },
  });
}
