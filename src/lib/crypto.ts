import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM helper for provider secrets (OAuth tokens, app passwords) stored
 * in `account.secret_encrypted`. The key comes from `TELESCREEN_SECRET_KEY`:
 * 32 bytes encoded as 64 hex characters or as base64 (`openssl rand -hex 32`).
 *
 * Blob format: `v1.<iv>.<tag>.<ciphertext>` with base64url parts.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Parse a hex or base64 encoded 32-byte key. Throws a readable error otherwise. */
export function parseSecretKey(raw: string | undefined): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new Error("TELESCREEN_SECRET_KEY is not set. Generate one with `openssl rand -hex 32`.");
  }
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TELESCREEN_SECRET_KEY must be 32 bytes (64 hex characters or base64). Generate one with \`openssl rand -hex 32\`.`,
    );
  }
  return key;
}

/** True when the environment carries a usable key (for startup warnings). */
export function hasSecretKey(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    parseSecretKey(env.TELESCREEN_SECRET_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Encrypt `plaintext`. `key` defaults to `TELESCREEN_SECRET_KEY`. */
export function encryptSecret(plaintext: string, key: Buffer = parseSecretKey(process.env.TELESCREEN_SECRET_KEY)): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

/** Decrypt a blob from {@link encryptSecret}. Throws if the key is wrong or the blob was altered. */
export function decryptSecret(blob: string, key: Buffer = parseSecretKey(process.env.TELESCREEN_SECRET_KEY)): string {
  const [version, iv, tag, data] = blob.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Unrecognized secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
