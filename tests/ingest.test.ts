// Unit tests for the pure (network-free) parts of the ingest pipeline.

import { describe, expect, it } from "vitest";
import type { DomainId } from "../src/types.ts";
import { classifyDomain } from "../ingest/classify.ts";
import { classifyGraph } from "../ingest/classify-graph.ts";
import { githubFromUrl, parsePurl, resolveToRepo } from "../ingest/resolve.ts";

describe("classifyDomain", () => {
  it("classifies from topics", () => {
    expect(classifyDomain(["pytorch", "deep-learning"], "Python", "")).toBe("ai");
    expect(classifyDomain(["kubernetes", "helm"], "Go", "")).toBe("cloud");
  });

  it("falls back to the description when topics are empty", () => {
    expect(classifyDomain([], null, "A fast SQL database with columnar storage")).toBe("databases");
  });

  it("weights topics above description", () => {
    // one topic hit (2) beats one description hit (1)
    expect(classifyDomain(["blockchain"], null, "a game")).toBe("blockchain");
  });

  it("matches whole tokens, not substrings", () => {
    // "email"/"domain" contain "ai" but must not count as AI keywords
    expect(classifyDomain([], null, "email domain server")).toBe("web");
  });

  it("uses the language hint when there is no other signal", () => {
    expect(classifyDomain([], "Solidity", "")).toBe("blockchain");
    expect(classifyDomain([], "HCL", "")).toBe("devops");
  });

  it("returns a domain even with no signal at all", () => {
    expect(classifyDomain([], null, "")).toBeTypeOf("string");
  });
});

describe("parsePurl", () => {
  it("parses a simple purl and strips the version", () => {
    expect(parsePurl("pkg:npm/lodash@4.17.21")).toEqual({ type: "npm", namespace: null, name: "lodash" });
  });

  it("keeps npm scopes, encoded or not", () => {
    const want = { type: "npm", namespace: "@babel", name: "core" };
    expect(parsePurl("pkg:npm/@babel/core@7.0.0")).toEqual(want);
    expect(parsePurl("pkg:npm/%40babel/core@7.0.0")).toEqual(want);
  });

  it("keeps npm scopes when there is no version", () => {
    expect(parsePurl("pkg:npm/@babel/core")).toEqual({ type: "npm", namespace: "@babel", name: "core" });
    expect(parsePurl("pkg:npm/lodash")).toEqual({ type: "npm", namespace: null, name: "lodash" });
  });

  it("drops subpaths", () => {
    expect(parsePurl("pkg:golang/github.com/spf13/cobra@v1.8.0#cmd")?.name).toBe("cobra");
  });

  it("parses multi-segment namespaces", () => {
    expect(parsePurl("pkg:golang/github.com/spf13/cobra@v1.8.0")).toEqual({
      type: "golang",
      namespace: "github.com/spf13",
      name: "cobra",
    });
  });

  it("drops qualifiers", () => {
    expect(parsePurl("pkg:pypi/requests?arch=any")?.name).toBe("requests");
  });

  it("rejects non-purls and purls without a name", () => {
    expect(parsePurl("npm/lodash")).toBeNull();
    expect(parsePurl("pkg:npm")).toBeNull();
  });
});

describe("githubFromUrl", () => {
  it.each([
    ["https://github.com/facebook/react", "facebook/react"],
    ["git+https://github.com/facebook/react.git", "facebook/react"],
    ["git@github.com:facebook/react.git", "facebook/react"],
    ["https://github.com/facebook/react/tree/main/packages", "facebook/react"],
    ["https://github.com/facebook/react#readme", "facebook/react"],
  ])("%s -> %s", (url, want) => {
    expect(githubFromUrl(url)).toBe(want);
  });

  it("returns null for non-GitHub or missing URLs", () => {
    expect(githubFromUrl("https://gitlab.com/a/b")).toBeNull();
    expect(githubFromUrl(undefined)).toBeNull();
    expect(githubFromUrl(null)).toBeNull();
    expect(githubFromUrl("")).toBeNull();
  });
});

describe("resolveToRepo (offline purl types)", () => {
  it("resolves github and githubactions purls directly", async () => {
    expect(await resolveToRepo({ type: "github", namespace: "actions", name: "checkout" })).toBe("actions/checkout");
    expect(await resolveToRepo({ type: "githubactions", namespace: "actions", name: "setup-node" })).toBe(
      "actions/setup-node"
    );
  });

  it("resolves golang modules hosted on github.com", async () => {
    expect(await resolveToRepo({ type: "golang", namespace: "github.com/spf13", name: "cobra" })).toBe("spf13/cobra");
    expect(await resolveToRepo({ type: "golang", namespace: "golang.org/x", name: "net" })).toBeNull();
  });

  it("returns null for unknown purl types", async () => {
    expect(await resolveToRepo({ type: "maven", namespace: "org.apache", name: "commons" })).toBeNull();
  });
});

describe("classifyGraph", () => {
  const seeds = new Map<string, DomainId>([
    ["torch", "ai"],
    ["react", "web"],
  ]);

  it("propagates seed labels to neighbours and never returns seeds", () => {
    const out = classifyGraph(["torch", "react", "x"], seeds, [{ a: "x", b: "torch", w: 1 }]);
    expect(out.get("x")).toEqual({ domain: "ai", confidence: 1 });
    expect(out.has("torch")).toBe(false);
  });

  it("propagates across multiple hops", () => {
    const out = classifyGraph(
      ["torch", "react", "x", "y"],
      seeds,
      [
        { a: "torch", b: "x", w: 1 },
        { a: "x", b: "y", w: 1 },
      ]
    );
    expect(out.get("y")?.domain).toBe("ai");
  });

  it("picks the heavier vote and reports the vote share as confidence", () => {
    const out = classifyGraph(
      ["torch", "react", "x"],
      seeds,
      [
        { a: "x", b: "torch", w: 3 },
        { a: "x", b: "react", w: 1 },
      ]
    );
    expect(out.get("x")).toEqual({ domain: "ai", confidence: 0.75 });
  });

  it("leaves isolated nodes unclassified and ignores unknown/self edges", () => {
    const out = classifyGraph(
      ["torch", "react", "lonely"],
      seeds,
      [
        { a: "lonely", b: "lonely", w: 5 },
        { a: "lonely", b: "ghost", w: 5 },
      ]
    );
    expect(out.has("lonely")).toBe(false);
  });
});
