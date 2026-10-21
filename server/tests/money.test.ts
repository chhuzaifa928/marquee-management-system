import { describe, it, expect } from "vitest";
import { add, mul, round2, sum, sub, format, toPrisma } from "../src/lib/money";

describe("money math (no floats)", () => {
  it("rounds half-up to 2 dp", () => {
    expect(round2("1.005").toFixed(2)).toBe("1.01");
    expect(round2("2.344").toFixed(2)).toBe("2.34");
    expect(round2("2.345").toFixed(2)).toBe("2.35");
  });

  it("does not drift like binary floats", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float; must be exact here.
    expect(add("0.1", "0.2").toFixed(2)).toBe("0.30");
    expect(sum(["0.1", "0.2", "0.3"]).toFixed(2)).toBe("0.60");
  });

  it("computes per-head charges precisely", () => {
    // discountedRate 1234.56 × 350 guests
    expect(mul("1234.56", 350).toFixed(2)).toBe("432096.00");
  });

  it("subtracts correctly", () => {
    expect(sub("1000.00", "999.99").toFixed(2)).toBe("0.01");
  });

  it("formats with thousands separators", () => {
    expect(format("1234567.5")).toBe("1,234,567.50");
    expect(format(0)).toBe("0.00");
  });

  it("toPrisma yields a 2dp Decimal", () => {
    expect(toPrisma("10.1").toFixed(2)).toBe("10.10");
  });
});
