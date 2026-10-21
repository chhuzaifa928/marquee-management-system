import { describe, it, expect } from "vitest";
import { NumberSequenceService, SEQ } from "../src/services/numberSequence";
import { prisma } from "../src/prisma";

describe("NumberSequenceService — gapless numbering", () => {
  it("produces a formatted, zero-padded sequence", async () => {
    const a = await NumberSequenceService.next(SEQ.booking.key, SEQ.booking.prefix);
    const b = await NumberSequenceService.next(SEQ.booking.key, SEQ.booking.prefix);
    const c = await NumberSequenceService.next(SEQ.booking.key, SEQ.booking.prefix);
    expect([a, b, c]).toEqual(["BKG-0001", "BKG-0002", "BKG-0003"]);
  });

  it("keeps separate counters per key (incl. per voucher type)", async () => {
    const rv1 = await NumberSequenceService.next(...voucher("RV"));
    const pv1 = await NumberSequenceService.next(...voucher("PV"));
    const rv2 = await NumberSequenceService.next(...voucher("RV"));
    expect(rv1).toBe("RV-0001");
    expect(pv1).toBe("PV-0001");
    expect(rv2).toBe("RV-0002");
  });

  it("is gapless and collision-free under concurrency", async () => {
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        NumberSequenceService.next(SEQ.slip.key, SEQ.slip.prefix),
      ),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(N); // no collisions

    const numbers = results
      .map((r) => Number(r.replace("SLIP-", "")))
      .sort((a, b) => a - b);
    // Exactly 1..N with no gaps.
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it("rolls back the allocation if the caller's transaction fails (no gap)", async () => {
    const first = await NumberSequenceService.next(SEQ.customer.key, SEQ.customer.prefix);
    expect(first).toBe("CUST-0001");

    await expect(
      prisma.$transaction(async (tx) => {
        const allocated = await NumberSequenceService.next(
          SEQ.customer.key,
          SEQ.customer.prefix,
          4,
          tx,
        );
        expect(allocated).toBe("CUST-0002");
        throw new Error("boom"); // force rollback
      }),
    ).rejects.toThrow("boom");

    // The rolled-back allocation left no gap: next is still 0002.
    const next = await NumberSequenceService.next(SEQ.customer.key, SEQ.customer.prefix);
    expect(next).toBe("CUST-0002");
  });
});

function voucher(type: "RV" | "EV" | "PV" | "JV"): [string, string] {
  const s = SEQ.voucher(type);
  return [s.key, s.prefix];
}
