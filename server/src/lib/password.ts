import bcrypt from "bcryptjs";

// NOTE: the build spec calls for `bcrypt`. We use `bcryptjs` — a drop-in,
// API-compatible pure-JS implementation — to avoid native node-gyp build
// failures on Windows. Hashes are interchangeable with the native package.

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
