// In-memory cap on flag guesses: a solver gets a small number of tries
// per challenge in a short window, then has to wait before trying again.
// This keeps brute-forcing a flag impractical without locking anyone out.
export function createGuessLimiter({ windowMs = 60_000, max = 10 } = {}) {
  const attempts = new Map(); // key -> timestamps of recent guesses

  return {
    check(key) {
      const now = Date.now();
      const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: windowMs - (now - recent[0]),
        };
      }
      recent.push(now);
      attempts.set(key, recent);
      return { allowed: true, remaining: max - recent.length, retryAfterMs: 0 };
    },
    reset() {
      attempts.clear();
    },
  };
}
