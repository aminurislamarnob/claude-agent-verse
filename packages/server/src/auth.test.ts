import { describe, it, expect } from "vitest";
import { generateToken, isAllowedOrigin, isValidToken } from "./auth.js";

describe("auth", () => {
  describe("generateToken", () => {
    it("generates a random string", () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(typeof token1).toBe("string");
      expect(token1.length).toBeGreaterThan(0);
      expect(token1).not.toBe(token2);
    });
  });

  describe("isAllowedOrigin", () => {
    it("allows undefined origin (direct navigation)", () => {
      expect(isAllowedOrigin(undefined, "127.0.0.1:4800")).toBe(true);
    });

    it("allows exact matching http origin", () => {
      expect(isAllowedOrigin("http://127.0.0.1:4800", "127.0.0.1:4800")).toBe(true);
    });

    it("allows exact matching https origin", () => {
      expect(isAllowedOrigin("https://127.0.0.1:4800", "127.0.0.1:4800")).toBe(true);
    });

    it("rejects mismatched origin", () => {
      expect(isAllowedOrigin("http://evil.com", "127.0.0.1:4800")).toBe(false);
      expect(isAllowedOrigin("http://127.0.0.1:4801", "127.0.0.1:4800")).toBe(false);
      expect(isAllowedOrigin("http://localhost:4800", "127.0.0.1:4800")).toBe(false);
    });
  });

  describe("isValidToken", () => {
    it("returns true for matching token in URL", () => {
      expect(isValidToken("/ws?token=secret123", "secret123")).toBe(true);
      expect(isValidToken("/?foo=bar&token=secret123", "secret123")).toBe(true);
    });

    it("returns false for missing token", () => {
      expect(isValidToken("/ws", "secret123")).toBe(false);
      expect(isValidToken("/ws?token=", "secret123")).toBe(false);
    });

    it("returns false for incorrect token", () => {
      expect(isValidToken("/ws?token=wrong", "secret123")).toBe(false);
    });

    it("returns false for undefined URL", () => {
      expect(isValidToken(undefined, "secret123")).toBe(false);
    });
  });
});
