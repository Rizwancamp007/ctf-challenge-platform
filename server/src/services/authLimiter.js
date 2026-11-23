// In-memory cap on sign-in and sign-up attempts: a few tries per
// address in a short window, then a short wait. This keeps password
// guessing impractical without locking real people out for long.
export function createAuthLimiter({ windowMs = 15 * 60_000, max = 10 } = {}) {
  const attempts = new Map(); // key -> timestamps of recent attempts

  return {
    check(key) {
      const now = Date.now();
      const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        return {
          allowed: false,
          retryAfterMs: windowMs - (now - recent[0]),
        };
      }
      recent.push(now);
      attempts.set(key, recent);
      return { allowed: true, retryAfterMs: 0 };
    },
    reset() {
      attempts.clear();
    },
  };
}
