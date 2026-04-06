import { describe, it, expect } from "vitest";
import { GitHubClient } from "../../src/lib/github-client.js";

describe("GitHubClient", () => {
  it("can be instantiated with a token and cache", async () => {
    const { Cache } = await import("../../src/lib/cache.js");
    const cache = new Cache("/tmp/test-cache");
    const client = new GitHubClient("test-token", cache);
    expect(client).toBeInstanceOf(GitHubClient);
  });
});
