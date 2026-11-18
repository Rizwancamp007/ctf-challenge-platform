import { createHash, timingSafeEqual } from "node:crypto";

// Flags are never stored in plain text — only a salted hash lives in the
// database, so a leaked dump still doesn't give the flags away.
export function hashFlag(flag) {
  const salt = process.env.FLAG_SALT || "";
  return createHash("sha256").update(`${salt}:${String(flag).trim()}`).digest("hex");
}

// Constant-time compare, so a wrong guess can't leak how close it was
// through timing. Different-length inputs just return false.
export function verifyFlag(flag, flagHash) {
  if (typeof flag !== "string" || typeof flagHash !== "string") return false;
  const candidate = Buffer.from(hashFlag(flag), "utf8");
  const expected = Buffer.from(flagHash, "utf8");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
