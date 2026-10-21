import crypto from "node:crypto";
import { env } from "../env";

/**
 * CNIC protection.
 *
 *  - At rest: AES-256-GCM authenticated encryption. The stored string is
 *    `iv:authTag:ciphertext` (all hex). Decryptable only with CNIC_ENC_KEY.
 *  - Search: a deterministic HMAC-SHA256 "blind index" keyed by CNIC_INDEX_KEY.
 *    The same CNIC always hashes to the same index, enabling EXACT-match
 *    lookups without ever exposing the plaintext — and making partial search
 *    impossible by design.
 *
 * CNIC is normalised (digits only) before both operations so "12345-6789012-3"
 * and "1234567890123" are treated identically.
 */

const ENC_KEY = Buffer.from(env.CNIC_ENC_KEY, "hex"); // 32 bytes
const IV_LENGTH = 12; // GCM standard nonce length

export function normalizeCnic(cnic: string): string {
  return cnic.replace(/\D/g, "");
}

export function encryptCnic(cnic: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const plaintext = normalizeCnic(cnic);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptCnic(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed CNIC ciphertext");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ENC_KEY,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Deterministic blind index for exact-match search. */
export function cnicBlindIndex(cnic: string): string {
  return crypto
    .createHmac("sha256", env.CNIC_INDEX_KEY)
    .update(normalizeCnic(cnic))
    .digest("hex");
}

/**
 * Mask a decrypted CNIC for display, e.g. "1234567890123" -> "*****-*****12-3".
 * Only the last 3 digits are revealed.
 */
export function maskCnic(cnic: string): string {
  const n = normalizeCnic(cnic);
  if (n.length < 3) return "***";
  return `*****-******${n.slice(-3, -1)}-${n.slice(-1)}`;
}
