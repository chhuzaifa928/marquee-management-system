import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { verifyPassword } from "../../lib/password";
import { isSuperAdmin } from "../../auth/rbac";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt";
import { getSettings } from "../settings/settings.service";

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

async function loadUserWithRoles(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
}

function toPublicUser(user: {
  id: number;
  name: string;
  email: string;
  roles: { role: { name: string } }[];
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles.map((r) => r.role.name),
  };
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * Authenticate by email + password. Honours the system lock: while locked,
 * only super_admin may log in (enforced here, in the login guard).
 */
export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { roles: { include: { role: true } } },
  });

  // Uniform error to avoid leaking which emails exist.
  if (!user) throw AppError.unauthorized("Invalid email or password");

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized("Invalid email or password");

  if (!user.isActive) {
    throw AppError.forbidden("This account is disabled");
  }

  const roles = user.roles.map((r) => r.role.name);

  const settings = await getSettings();
  if (settings.systemLocked && !isSuperAdmin(roles)) {
    throw AppError.forbidden(
      "The system is locked. Only a super admin can log in right now.",
    );
  }

  const publicUser = toPublicUser(user);
  return {
    user: publicUser,
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
    }),
    refreshToken: signRefreshToken(user.id),
  };
}

/** Issue a fresh access token from a valid refresh token. */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  const user = await loadUserWithRoles(payload.sub);
  if (!user || !user.isActive) {
    throw AppError.unauthorized("Account no longer valid");
  }

  const roles = user.roles.map((r) => r.role.name);
  const settings = await getSettings();
  if (settings.systemLocked && !isSuperAdmin(roles)) {
    throw AppError.forbidden("The system is locked.");
  }

  const publicUser = toPublicUser(user);
  return {
    user: publicUser,
    accessToken: signAccessToken({ sub: user.id, email: user.email, roles }),
    refreshToken: signRefreshToken(user.id),
  };
}

export async function getProfile(userId: number): Promise<PublicUser> {
  const user = await loadUserWithRoles(userId);
  if (!user) throw AppError.notFound("User not found");
  return toPublicUser(user);
}
