import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM, ported from mike's userApiKeys encryption. A scrypt KDF derives a
// 32-byte key from ENCRYPTION_KEY. Each value gets a fresh 12-byte IV; the GCM
// auth tag is stored alongside.

export type EncryptedBlob = { encrypted: string; iv: string; authTag: string };

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");
  cachedKey = scryptSync(secret, "gitcounsel.salt.v1", 32);
  return cachedKey;
}

export function encrypt(plaintext: string): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encrypted: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(blob: EncryptedBlob): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
