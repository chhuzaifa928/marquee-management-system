import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptCnic,
  decryptCnic,
  cnicBlindIndex,
  normalizeCnic,
  maskCnic,
} from "../src/lib/crypto";
import { prisma } from "../src/prisma";

describe("CNIC encryption + blind index", () => {
  const cnic = "35202-1234567-1";

  it("normalises to digits only", () => {
    expect(normalizeCnic(cnic)).toBe("3520212345671");
    expect(normalizeCnic("3520212345671")).toBe("3520212345671");
  });

  it("round-trips through AES-256-GCM", () => {
    const enc = encryptCnic(cnic);
    expect(enc).not.toContain("3520212345671");
    expect(decryptCnic(enc)).toBe("3520212345671");
  });

  it("produces a different ciphertext each time (random IV) but same plaintext", () => {
    const a = encryptCnic(cnic);
    const b = encryptCnic(cnic);
    expect(a).not.toBe(b);
    expect(decryptCnic(a)).toBe(decryptCnic(b));
  });

  it("blind index is deterministic and format-insensitive", () => {
    expect(cnicBlindIndex(cnic)).toBe(cnicBlindIndex("3520212345671"));
    expect(cnicBlindIndex(cnic)).not.toBe(cnicBlindIndex("3520212345672"));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const enc = encryptCnic(cnic);
    const tampered = enc.slice(0, -2) + (enc.endsWith("00") ? "11" : "00");
    expect(() => decryptCnic(tampered)).toThrow();
  });

  it("masks for display", () => {
    expect(maskCnic("3520212345671")).toMatch(/7-1$/);
  });
});

describe("exact-match CNIC search via blind index (partial impossible by design)", () => {
  beforeEach(async () => {
    await prisma.customer.create({
      data: {
        code: "CUST-0001",
        name: "Ali",
        cnicEnc: encryptCnic("3520212345671"),
        cnicIndex: cnicBlindIndex("3520212345671"),
      },
    });
  });

  it("finds a customer by full CNIC", async () => {
    const found = await prisma.customer.findFirst({
      where: { cnicIndex: cnicBlindIndex("35202-1234567-1") },
    });
    expect(found?.name).toBe("Ali");
    expect(decryptCnic(found!.cnicEnc!)).toBe("3520212345671");
  });

  it("cannot find by a partial CNIC (no partial index exists)", async () => {
    const found = await prisma.customer.findFirst({
      where: { cnicIndex: cnicBlindIndex("3520212") },
    });
    expect(found).toBeNull();
  });
});
