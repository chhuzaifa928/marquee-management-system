import bcrypt from "bcryptjs";
import { isTest } from "../env";

// NOTE: the build spec calls for `bcrypt`. We use `bcryptjs` — a drop-in,
// API-compatible pure-JS implementation — to avoid native node-gyp build
// failures on Windows. Hashes are interchangeable with the native package.

// Full strength in real use; a cheaper factor under test keeps the suite fast
// (many logins) without weakening production security.
const SALT_ROUNDS = isTest ? 6 : 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
