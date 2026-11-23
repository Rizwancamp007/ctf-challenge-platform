import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import express from "express";
import { createApp } from "../src/app.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";
import { hashPassword } from "../src/services/auth.js";
import { createMemoryStore } from "../src/store/users.js";

process.env.JWT_SECRET = "test-secret-for-ctf-tests";

let base;
let server;
let guardBase;
let guardServer;
const store = createMemoryStore();

before(async () => {
  const app = createApp({ store });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  // A stand-in admin route, so the role guard itself gets exercised.
  const guardApp = express();
  guardApp.use(express.json());
  guardApp.get(
    "/admin-only",
    requireAuth,
    requireRole("admin"),
    (req, res) => res.json({ ok: true })
  );
  await new Promise((resolve) => {
    guardServer = guardApp.listen(0, () => {
      guardBase = `http://127.0.0.1:${guardServer.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => guardServer.close(resolve));
});

async function post(url, body, token) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function get(url, token) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

describe("auth", () => {
  test("health returns ok", async () => {
    const { status, body } = await get(`${base}/health`);
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
  });

  test("register creates a player and returns a token", async () => {
    const { status, body } = await post(`${base}/api/auth/register`, {
      name: "Ayesha Khan",
      email: "ayesha@example.com",
      password: "playerpass1",
    });
    assert.equal(status, 201);
    assert.equal(body.user.email, "ayesha@example.com");
    assert.equal(body.user.role, "player");
    assert.equal(body.user.passwordHash, undefined);
    assert.ok(body.token);
  });

  test("register never hands out admin, even when asked", async () => {
    const { status, body } = await post(`${base}/api/auth/register`, {
      name: "Sneaky Admin",
      email: "sneaky@example.com",
      password: "playerpass1",
      role: "admin",
    });
    assert.equal(status, 201);
    assert.equal(body.user.role, "player");
  });

  test("register rejects a short password, a bad email and a duplicate", async () => {
    const short = await post(`${base}/api/auth/register`, {
      name: "Short",
      email: "short@example.com",
      password: "short",
    });
    assert.equal(short.status, 400);

    const badEmail = await post(`${base}/api/auth/register`, {
      name: "Bad",
      email: "not-an-email",
      password: "playerpass1",
    });
    assert.equal(badEmail.status, 400);

    const dup = await post(`${base}/api/auth/register`, {
      name: "Again",
      email: "ayesha@example.com",
      password: "playerpass1",
    });
    assert.equal(dup.status, 409);
  });

  test("login works and a wrong password does not", async () => {
    const ok = await post(`${base}/api/auth/login`, {
      email: "ayesha@example.com",
      password: "playerpass1",
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.equal(ok.body.user.role, "player");

    const wrong = await post(`${base}/api/auth/login`, {
      email: "ayesha@example.com",
      password: "wrongpassword",
    });
    assert.equal(wrong.status, 401);
  });

  test("me needs a token and returns the logged-in player", async () => {
    const noToken = await get(`${base}/api/auth/me`);
    assert.equal(noToken.status, 401);

    const login = await post(`${base}/api/auth/login`, {
      email: "ayesha@example.com",
      password: "playerpass1",
    });
    const me = await get(`${base}/api/auth/me`, login.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, "ayesha@example.com");
    assert.equal(me.body.user.passwordHash, undefined);
  });

  test("role guard: player is refused, admin is let through", async () => {
    const playerLogin = await post(`${base}/api/auth/login`, {
      email: "ayesha@example.com",
      password: "playerpass1",
    });
    const refused = await get(`${guardBase}/admin-only`, playerLogin.body.token);
    assert.equal(refused.status, 403);

    await store.create({
      name: "Demo Admin",
      email: "admin@example.com",
      passwordHash: await hashPassword("adminpass1"),
      role: "admin",
    });
    const adminLogin = await post(`${base}/api/auth/login`, {
      email: "admin@example.com",
      password: "adminpass1",
    });
    const allowed = await get(`${guardBase}/admin-only`, adminLogin.body.token);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.ok, true);

    const noToken = await get(`${guardBase}/admin-only`);
    assert.equal(noToken.status, 401);
  });

  test("unknown paths answer JSON, not an HTML error page", async () => {
    const { status, body } = await get(`${base}/api/nope`);
    assert.equal(status, 404);
    assert.equal(body.message, "Not found");
  });
});

describe("auth rate limiting", () => {
  let limitedBase;
  let limitedServer;

  before(async () => {
    const { createAuthLimiter } = await import("../src/services/authLimiter.js");
    const app = createApp({
      store: createMemoryStore(),
      authLimiter: createAuthLimiter({ windowMs: 60_000, max: 3 }),
    });
    await new Promise((resolve) => {
      limitedServer = app.listen(0, () => {
        limitedBase = `http://127.0.0.1:${limitedServer.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => limitedServer.close(resolve));
  });

  test("repeated login attempts from one address are refused after the cap", async () => {
    for (let i = 0; i < 3; i++) {
      const attempt = await post(`${limitedBase}/api/auth/login`, {
        email: "guess@example.com",
        password: "wrongpass1",
      });
      assert.equal(attempt.status, 401);
    }
    const blocked = await post(`${limitedBase}/api/auth/login`, {
      email: "guess@example.com",
      password: "wrongpass1",
    });
    assert.equal(blocked.status, 429);
    assert.equal(typeof blocked.body.retryAfterSeconds, "number");
  });

  test("repeated sign-ups from one address are refused after the cap", async () => {
    for (let i = 0; i < 3; i++) {
      const attempt = await post(`${limitedBase}/api/auth/register`, {
        name: `Tester ${i}`,
        email: "signup@example.com",
        password: "testpass1",
      });
      // First sign-up succeeds, the rest are duplicates — both count.
      assert.ok(attempt.status === 201 || attempt.status === 409);
    }
    const blocked = await post(`${limitedBase}/api/auth/register`, {
      name: "Tester",
      email: "signup@example.com",
      password: "testpass1",
    });
    assert.equal(blocked.status, 429);
  });
});
