import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env";

export interface AccessTokenPayload {
  sub: number; // user id
  roles: string[];
  email: string;
}

export interface RefreshTokenPayload {
  sub: number;
  tokenType: "refresh";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(userId: number): string {
  return jwt.sign(
    { sub: userId, tokenType: "refresh" } satisfies RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL } as SignOptions,
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(
    token,
    env.JWT_REFRESH_SECRET,
  ) as unknown as RefreshTokenPayload;
  if (decoded.tokenType !== "refresh") {
    throw new Error("Not a refresh token");
  }
  return decoded;
}
