import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  isValidUuid,
  assertSafePath,
  sanitizeContentDispositionFilename,
  attachmentDisposition,
  getUploadsRoot,
} from "../lib/uploads";

describe("isValidUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUuid("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")).toBe(true);
  });

  it("rejects non-UUIDs (path traversal, plain strings, partial)", () => {
    expect(isValidUuid("../../../etc/passwd")).toBe(false);
    expect(isValidUuid("abc")).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716-44665544000Z")).toBe(false);
  });
});

describe("assertSafePath", () => {
  const root = "/data/uploads";

  it("allows paths inside the root", () => {
    expect(() => assertSafePath("/data/uploads/abc/file.pdf", root)).not.toThrow();
    expect(() => assertSafePath("/data/uploads", root)).not.toThrow();
  });

  it("blocks parent-dir escape", () => {
    expect(() => assertSafePath("/data/uploads/../etc/passwd", root)).toThrow(/path escape/);
  });

  it("blocks absolute path that just happens to match prefix as a sibling", () => {
    // /data/uploads-evil/x.pdf shares the prefix string but is NOT under root.
    expect(() => assertSafePath("/data/uploads-evil/x.pdf", root)).toThrow();
  });

  it("blocks completely unrelated absolute paths", () => {
    expect(() => assertSafePath("/etc/passwd", root)).toThrow();
  });
});

describe("sanitizeContentDispositionFilename", () => {
  it("strips CRLF (response splitting) and quotes", () => {
    expect(sanitizeContentDispositionFilename(`bad\r\nname"with\\stuff/.pdf`))
      .not.toMatch(/[\r\n"\\\/]/);
  });

  it("preserves a normal filename", () => {
    expect(sanitizeContentDispositionFilename("report.pdf")).toBe("report.pdf");
  });

  it("falls back to 'file' on empty/unsafe-only input", () => {
    expect(sanitizeContentDispositionFilename("")).toBe("file");
    expect(sanitizeContentDispositionFilename("\r\n\r\n")).toBe("file");
  });
});

describe("attachmentDisposition", () => {
  it("emits attachment, never inline", () => {
    expect(attachmentDisposition("report.pdf")).toMatch(/^attachment;/);
  });

  it("escapes CRLF before interpolating", () => {
    const value = attachmentDisposition("nasty\r\nname.pdf");
    expect(value).not.toMatch(/[\r\n]/);
  });
});

describe("getUploadsRoot", () => {
  it("returns an absolute path", () => {
    const root = getUploadsRoot();
    expect(path.isAbsolute(root)).toBe(true);
  });
});
