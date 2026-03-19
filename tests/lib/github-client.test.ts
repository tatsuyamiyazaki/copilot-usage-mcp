import { describe, it, expect } from "vitest";
import { splitIntoChunks } from "../../src/lib/github-client.js";

describe("splitIntoChunks", () => {
  it("returns single chunk for <= 28 days", () => {
    const chunks = splitIntoChunks("2026-01-01", "2026-01-28");
    expect(chunks).toEqual([{ since: "2026-01-01", until: "2026-01-28" }]);
  });

  it("splits into multiple chunks for > 28 days", () => {
    const chunks = splitIntoChunks("2026-01-01", "2026-03-01");
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toEqual({ since: "2026-01-01", until: "2026-01-28" });
    expect(chunks[1]).toEqual({ since: "2026-01-29", until: "2026-02-25" });
    expect(chunks[2]).toEqual({ since: "2026-02-26", until: "2026-03-01" });
  });

  it("handles exact 28-day boundary", () => {
    const chunks = splitIntoChunks("2026-01-01", "2026-01-28");
    expect(chunks).toHaveLength(1);
  });
});
