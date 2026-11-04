import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseSecretKey } from "../src/lib/crypto.js";

describe("crypto", () => {
  const key = parseSecretKey(randomBytes(32).toString("hex"));

  it("round-trips and uses a fresh IV", () => {
    const a = encryptSecret("app-password", key);
    expect(a).not.toContain("app-password");
    expect(decryptSecret(a, key)).toBe("app-password");
    expect(encryptSecret("app-password", key)).not.toBe(a);
  });

  it("rejects tampering and the wrong key", () => {
    const blob = encryptSecret("secret", key);
    expect(() => decryptSecret(blob, parseSecretKey(randomBytes(32).toString("base64")))).toThrow();
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("validates the key", () => {
    expect(() => parseSecretKey(undefined)).toThrow(/not set/);
    expect(() => parseSecretKey("short")).toThrow(/32 bytes/);
  });
});
