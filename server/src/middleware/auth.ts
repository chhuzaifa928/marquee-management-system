import type { NextFunction, Request, Response } from "express";
import {
  canAccessModule,
  hasAnyRole,
  type ModuleKey,
  type RoleName,
} from "../auth/rbac";
import { AppError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";

export const ACCESS_COOKIE = "gp_access";
export const REFRESH_COOKIE = "gp_refresh";

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
}

/** Require a valid access token; attaches req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(AppError.unauthorized());
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
    return next();
  } catch {
    return next(AppError.unauthorized("Invalid or expired session"));
  }
}

/** Require access to a module (server-side RBAC — the real security boundary). */
export function requireModule(moduleKey: ModuleKey) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!canAccessModule(req.user.roles, moduleKey)) {
      return next(AppError.forbidden());
    }
    return next();
  };
}

/** Require at least one of the given roles (super_admin always passes). */
export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!hasAnyRole(req.user.roles, roles)) {
      return next(AppError.forbidden());
    }
    return next();
  };
}
