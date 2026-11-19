// In-memory cap on flag guesses: a solver gets a small number of tries
// per challenge in a short window, then has to wait before trying again.
// On top of that, a run of wrong guesses in a row earns a short cooldown
// — guessing the flag is fine, hammering it is not. This keeps
// brute-forcing a flag impractical without locking anyone out.
export function createGuessLimiter({
  windowMs = 60_000,
  max = 10,
  wrongBeforeCooldown = 5,
  cooldownMs = 60_000,
} = {}) {
  const attempts = new Map(); // key -> timestamps of recent guesses
  const wrongStreaks = new Map(); // key -> { wrong, cooldownUntil }

  return {
    check(key) {
      const now = Date.now();
      const streak = wrongStreaks.get(key);
      if (streak && streak.cooldownUntil > now) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: streak.cooldownUntil - now,
        };
      }
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
    recordWrong(key) {
      const now = Date.now();
      const streak = wrongStreaks.get(key) || { wrong: 0, cooldownUntil: 0 };
      streak.wrong += 1;
      if (streak.wrong >= wrongBeforeCooldown) {
        streak.cooldownUntil = now + cooldownMs;
        streak.wrong = 0;
      }
      wrongStreaks.set(key, streak);
    },
    recordCorrect(key) {
      wrongStreaks.delete(key);
    },
    reset() {
      attempts.clear();
      wrongStreaks.clear();
    },
  };
}
