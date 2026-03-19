import { describe, it, expect } from "vitest";
import { validateDateRange, validateDateFormat, validateTeamSlug } from "../../src/lib/validation.js";

describe("validateDateFormat", () => {
  it("accepts valid YYYY-MM-DD", () => {
    expect(validateDateFormat("2026-01-15")).toBe(true);
  });

  it("rejects invalid format", () => {
    expect(validateDateFormat("2026/01/15")).toBe(false);
    expect(validateDateFormat("not-a-date")).toBe(false);
    expect(validateDateFormat("2026-13-01")).toBe(false);
    expect(validateDateFormat("2026-01-32")).toBe(false);
  });
});

describe("validateDateRange", () => {
  it("accepts since before until", () => {
    expect(() => validateDateRange("2026-01-01", "2026-01-31")).not.toThrow();
  });

  it("throws when since is after until", () => {
    expect(() => validateDateRange("2026-02-01", "2026-01-01")).toThrow();
  });
});

describe("validateTeamSlug", () => {
  it("accepts valid slug", () => {
    expect(() => validateTeamSlug("my-team")).not.toThrow();
  });

  it("throws on empty string", () => {
    expect(() => validateTeamSlug("")).toThrow();
  });
});
