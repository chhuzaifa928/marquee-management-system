import { Router, type CookieOptions, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { env } from "../../env";
import { ACCESS_COOKIE, REFRESH_COOKIE, requireAuth } from "../../middleware/auth";
import { modulesForRoles } from "../../auth/rbac";
import { getProfile, login, refresh } from "./auth.service";

const router = Router();

// Rate-limit auth endpoints to blunt credential stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts. Try again later." } },
});

const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15m
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d

function cookieOpts(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge,
    path: "/",
  };
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(ACCESS_MAX_AGE));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(REFRESH_MAX_AGE));
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);
    const result = await login(email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({
      user: result.user,
      modules: modulesForRoles(result.user.roles),
      // Also return the access token for non-browser API clients.
      accessToken: result.accessToken,
    });
  }),
);

router.post(
  "/refresh",
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
    if (!token) throw AppError.unauthorized("No refresh token");
    const result = await refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({
      user: result.user,
      modules: modulesForRoles(result.user.roles),
      accessToken: result.accessToken,
    });
  }),
);

router.post("/logout", (_req, res) => {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getProfile(req.user!.id);
    res.json({ user, modules: modulesForRoles(user.roles) });
  }),
);

export default router;
