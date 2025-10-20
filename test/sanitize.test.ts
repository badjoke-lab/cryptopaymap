// tests/sanitize.test.ts
import { describe, it, expect } from "vitest";
import {
  sanitizeText,
  sanitizeHeaderValue,
  sanitizeUrl,
  normalizeUrl,
  safeFilename,
  validatePlaceId,
  // 追加
  resolvePlaceIdNamespace,
} from "../src/lib/sanitize";

describe("sanitizeText", () => {
  it("basic vectors", () => {
    expect(sanitizeText("")).toBe("");
    expect(sanitizeText("  abc  ")).toBe("abc");
    expect(sanitizeText("a\u0007b")).toBe("ab");
    expect(sanitizeText("hello\nworld")).toBe("hello world");
  });

  it("maxLen", () => {
    expect(sanitizeText("abcdef", { maxLen: 3 })).toBe("abc");
  });
});

describe("sanitizeHeaderValue", () => {
  it("removes header breaks and colons", () => {
    expect(sanitizeHeaderValue("A\r\nB: C")).toBe("AB  C");
  });
});

describe("sanitizeUrl", () => {
  it("accepts http/https", () => {
    expect(sanitizeUrl("https://example.com/path")).toBe("https://example.com/path");
  });
  it("rejects javascript scheme", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });
  it("strips %0A %0D", () => {
    expect(sanitizeUrl("http://a.test/abc%0A%0D")).toBe("http://a.test/abc");
  });
  it("rejects relative", () => {
    expect(sanitizeUrl("/relative/path")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("lowercases host and normalizes path", () => {
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/Path/")).toBe("https://example.com/Path");
  });
  it("resolves with base", () => {
    expect(normalizeUrl("./a/b", "https://example.com/base/")).toBe("https://example.com/base/a/b");
  });
  it("drops default ports", () => {
    expect(normalizeUrl("http://example.com:80/")).toBe("http://example.com/");
    expect(normalizeUrl("https://example.com:443/test/")).toBe("https://example.com/test");
  });
});

describe("safeFilename", () => {
  it("removes traversal and normalizes", () => {
    const fn = safeFilename("../etc/passwd");
    expect(fn).not.toMatch(/\.\.\//);
    expect(fn).toMatch(/file-/); // フォールバック名付与
  });
  it("keeps extension and constrains charset", () => {
    const fn = safeFilename("My Cute    ファイル(1).PNG");
    expect(fn.endsWith(".PNG")).toBe(true);
    expect(/^[A-Za-z0-9._-]+$/.test(fn)).toBe(true);
  });
});

describe("validatePlaceId (legacy OSM still passes)", () => {
  it("accepts good ids", () => {
    expect(validatePlaceId("osm:node:100")).toBe(true);
    expect(validatePlaceId("osm:way:67890")).toBe(true);
    expect(validatePlaceId("OSM:RELATION:1")).toBe(true);
  });
  it("rejects bad ids", () => {
    expect(validatePlaceId("../etc/passwd")).toBe(false);
    expect(validatePlaceId("osm:unknown:1")).toBe(false);
    expect(validatePlaceId("osm:node:abc")).toBe(false);
  });
});

/** ここから受け口拡張の追加テスト */
describe("validatePlaceId (extended inputs: cpm | gmaps)", () => {
  it("accepts cpm", () => {
    expect(validatePlaceId("cpm:jp-tokyo-coinbar-1")).toBe(true);
    expect(validatePlaceId("CPM:it-rome-crypto-cafe-2")).toBe(true); // 大文字混在OK
  });
  it("accepts gmaps", () => {
    expect(validatePlaceId("gmaps:place:ChIJAbCdEfGh123")).toBe(true);
  });
  it("rejects unknown namespace", () => {
    expect(validatePlaceId("foo:123")).toBe(false);
  });
});

describe("resolvePlaceIdNamespace", () => {
  it("resolves namespaces correctly", () => {
    expect(resolvePlaceIdNamespace("cpm:jp-tokyo-coinbar-1")).toBe("cpm");
    expect(resolvePlaceIdNamespace("osm:node:12345")).toBe("osm");
    expect(resolvePlaceIdNamespace("gmaps:place:ChIJAbCdEfGh123")).toBe("gmaps");
  });
  it("returns unknown on invalid input", () => {
    expect(resolvePlaceIdNamespace("osm:unknown:1")).toBe("unknown");
    expect(resolvePlaceIdNamespace("")).toBe("unknown");
  });
});
