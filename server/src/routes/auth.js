import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { checkPassword, hashPassword, signToken } from "../services/auth.js";
import { createAuthLimiter } from "../services/authLimiter.js";
import { publicUser } from "../store/users.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public sign-up always creates a player. Admin accounts come from the
// seed script only — nobody can give themselves admin by asking for it.
export function createAuthRouter(store, { authLimiter } = {}) {
  const router = express.Router();
  const limiter = authLimiter || createAuthLimiter();

  // Too many sign-in attempts from one address earns a short wait.
  function limitAttempts(req, res, email) {
    const key = `${req.ip || "unknown"}:${email.toLowerCase()}`;
    const result = limiter.check(key);
    if (!result.allowed) {
      res.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({
        message: "Too many attempts — please wait a bit and try again",
        retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
      });
      return false;
    }
    return true;
  }

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const email =
        typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!limitAttempts(req, res, email)) return;
      if (!name) return res.status(400).json({ message: "Name is required" });
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: "Enter a valid email" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password needs at least 8 characters" });
      }
      const existing = await store.findByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "That email is already registered" });
      }
      const user = await store.create({
        name,
        email,
        passwordHash: await hashPassword(password),
        role: "player",
      });
      let token;
      try {
        token = signToken(user);
      } catch {
        return res.status(500).json({ message: "Server auth is not configured" });
      }
      return res.status(201).json({ user: publicUser(user), token });
    })
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const email =
        typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!limitAttempts(req, res, email)) return;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const user = await store.findByEmail(email);
      if (!user || !(await checkPassword(password, user.passwordHash))) {
        return res.status(401).json({ message: "Wrong email or password" });
      }
      let token;
      try {
        token = signToken(user);
      } catch {
        return res.status(500).json({ message: "Server auth is not configured" });
      }
      return res.json({ user: publicUser(user), token });
    })
  );

  router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await store.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "Account not found" });
      return res.json({ user: publicUser(user) });
    })
  );

  return router;
}
