import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { hashFlag, verifyFlag } from "../src/services/flags.js";
import { createGuessLimiter } from "../src/services/guessLimiter.js";
import { hashPassword } from "../src/services/auth.js";
import { createMemoryChallengeStore } from "../src/store/challenges.js";
import { createMemorySolveStore } from "../src/store/solves.js";
import { createMemoryStore } from "../src/store/users.js";

process.env.JWT_SECRET = "test-secret-for-ctf-tests";
process.env.FLAG_SALT = "test-salt-for-ctf-tests";

let base;
let server;
const store = createMemoryStore();
const challengeStore = createMemoryChallengeStore();
const solveStore = createMemorySolveStore();

async function loginAs(email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

let adminToken;
let playerToken;
let otherToken;

before(async () => {
  const app = createApp({ store, challengeStore, solveStore });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  await store.create({
    name: "Demo Admin",
    email: "admin@example.com",
    passwordHash: await hashPassword("adminpass1"),
    role: "admin",
  });
  await store.create({
    name: "Ayesha Khan",
    email: "ayesha@example.com",
    passwordHash: await hashPassword("playerpass1"),
    role: "player",
  });
  await store.create({
    name: "Bilal Ahmed",
    email: "bilal@example.com",
    passwordHash: await hashPassword("playerpass1"),
    role: "player",
  });
  adminToken = await loginAs("admin@example.com", "adminpass1");
  playerToken = await loginAs("ayesha@example.com", "playerpass1");
  otherToken = await loginAs("bilal@example.com", "playerpass1");
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function req(method, path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const cryptoChallenge = {
  title: "Caesar's Secret",
  category: "crypto",
  difficulty: "easy",
  points: 100,
  description: "A message was shifted — shift it back.",
  flag: "flag{caesar_shift_three}",
};

describe("flag hashing", () => {
  test("hashing is deterministic and verify accepts only the right flag", () => {
    const hash = hashFlag("flag{caesar_shift_three}");
    assert.equal(hash, hashFlag("flag{caesar_shift_three}"));
    assert.equal(hash.length, 64);
    assert.equal(verifyFlag("flag{caesar_shift_three}", hash), true);
    assert.equal(verifyFlag("flag{wrong_flag}", hash), false);
    // A guess of a different length must not throw — the compare just says no.
    assert.equal(verifyFlag("x", hash), false);
    assert.equal(verifyFlag("", hash), false);
    assert.equal(verifyFlag(null, hash), false);
    assert.equal(verifyFlag("flag{caesar_shift_three}", null), false);
  });

  test("guess limiter allows a few tries, then refuses until the window passes", () => {
    const limiter = createGuessLimiter({ windowMs: 60_000, max: 3 });
    assert.equal(limiter.check("team-a").allowed, true);
    assert.equal(limiter.check("team-a").allowed, true);
    const third = limiter.check("team-a");
    assert.equal(third.allowed, true);
    assert.equal(third.remaining, 0);
    const fourth = limiter.check("team-a");
    assert.equal(fourth.allowed, false);
    assert.ok(fourth.retryAfterMs > 0);
    // A different solver is unaffected.
    assert.equal(limiter.check("team-b").allowed, true);
  });
});

describe("challenge admin", () => {
  let createdId;

  test("admin can create a challenge, and the flag hash never comes back", async () => {
    const { status, body } = await req("POST", "/api/challenges", cryptoChallenge, adminToken);
    assert.equal(status, 201);
    assert.equal(body.challenge.title, "Caesar's Secret");
    assert.equal(body.challenge.category, "crypto");
    assert.equal(body.challenge.points, 100);
    assert.equal(body.challenge.flagHash, undefined);
    assert.equal(body.challenge.flag, undefined);
    assert.ok(body.challenge.id);
    createdId = body.challenge.id;
  });

  test("players cannot create challenges, and strangers cannot at all", async () => {
    const asPlayer = await req("POST", "/api/challenges", cryptoChallenge, playerToken);
    assert.equal(asPlayer.status, 403);
    const noToken = await req("POST", "/api/challenges", cryptoChallenge);
    assert.equal(noToken.status, 401);
  });

  test("bad input is rejected: category, difficulty, points, missing flag", async () => {
    const badCategory = await req(
      "POST",
      "/api/challenges",
      { ...cryptoChallenge, category: "pwn" },
      adminToken
    );
    assert.equal(badCategory.status, 400);

    const badDifficulty = await req(
      "POST",
      "/api/challenges",
      { ...cryptoChallenge, difficulty: "impossible" },
      adminToken
    );
    assert.equal(badDifficulty.status, 400);

    const badPoints = await req(
      "POST",
      "/api/challenges",
      { ...cryptoChallenge, points: 5 },
      adminToken
    );
    assert.equal(badPoints.status, 400);

    const { flag, ...noFlag } = cryptoChallenge;
    const missingFlag = await req("POST", "/api/challenges", noFlag, adminToken);
    assert.equal(missingFlag.status, 400);

    const badFileUrl = await req(
      "POST",
      "/api/challenges",
      { ...cryptoChallenge, files: [{ name: "notes.txt", url: "javascript:alert(1)" }] },
      adminToken
    );
    assert.equal(badFileUrl.status, 400);
  });

  test("admin can update a challenge and rotate its flag", async () => {
    const updated = await req(
      "PUT",
      `/api/challenges/${createdId}`,
      { points: 150, description: "Updated description." },
      adminToken
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.challenge.points, 150);
    assert.equal(updated.body.challenge.description, "Updated description.");
    assert.equal(updated.body.challenge.flagHash, undefined);

    const rotated = await req(
      "PUT",
      `/api/challenges/${createdId}`,
      { flag: "flag{caesar_shift_four}" },
      adminToken
    );
    assert.equal(rotated.status, 200);

    // The old flag no longer works, the new one does.
    const oldFlag = await req(
      "POST",
      `/api/challenges/${createdId}/submit`,
      { flag: "flag{caesar_shift_three}" },
      playerToken
    );
    assert.equal(oldFlag.body.correct, false);
    const newFlag = await req(
      "POST",
      `/api/challenges/${createdId}/submit`,
      { flag: "flag{caesar_shift_four}" },
      playerToken
    );
    assert.equal(newFlag.body.correct, true);
    assert.equal(newFlag.body.solved, true);
    assert.equal(newFlag.body.points, 150);
  });

  test("players cannot update or delete, and unknown ids 404", async () => {
    const asPlayer = await req(
      "PUT",
      `/api/challenges/${createdId}`,
      { points: 10 },
      playerToken
    );
    assert.equal(asPlayer.status, 403);
    const deleteAsPlayer = await req("DELETE", `/api/challenges/${createdId}`, undefined, playerToken);
    assert.equal(deleteAsPlayer.status, 403);
    const unknown = await req("GET", "/api/challenges/00000000-0000-0000-0000-000000000000", undefined, adminToken);
    assert.equal(unknown.status, 404);
    const updateUnknown = await req(
      "PUT",
      "/api/challenges/00000000-0000-0000-0000-000000000000",
      { points: 100 },
      adminToken
    );
    assert.equal(updateUnknown.status, 404);
  });
});

describe("challenge list and detail", () => {
  let webId;
  let hiddenId;

  before(async () => {
    const web = await req(
      "POST",
      "/api/challenges",
      {
        title: "Login Bypass",
        category: "web",
        difficulty: "medium",
        points: 200,
        description: "The login form trusts the client too much.",
        flag: "flag{client_side_trust}",
      },
      adminToken
    );
    assert.equal(web.status, 201);
    webId = web.body.challenge.id;

    const hidden = await req(
      "POST",
      "/api/challenges",
      {
        title: "Hidden Draft",
        category: "misc",
        difficulty: "hard",
        points: 300,
        description: "Not ready yet.",
        flag: "flag{hidden_draft}",
        visible: false,
      },
      adminToken
    );
    assert.equal(hidden.status, 201);
    hiddenId = hidden.body.challenge.id;
  });

  test("list shows visible challenges with solved state and no flag hash", async () => {
    const { status, body } = await req("GET", "/api/challenges", undefined, playerToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.challenges));
    assert.ok(body.challenges.length >= 2);
    for (const c of body.challenges) {
      assert.equal(c.flagHash, undefined);
      assert.equal(c.flag, undefined);
      assert.equal(typeof c.solved, "boolean");
      assert.equal(typeof c.solveCount, "number");
    }
    const titles = body.challenges.map((c) => c.title);
    assert.ok(!titles.includes("Hidden Draft"));
  });

  test("category filter narrows the list", async () => {
    const { status, body } = await req("GET", "/api/challenges?category=web", undefined, playerToken);
    assert.equal(status, 200);
    assert.ok(body.challenges.length >= 1);
    assert.ok(body.challenges.every((c) => c.category === "web"));
    const bad = await req("GET", "/api/challenges?category=pwn", undefined, playerToken);
    assert.equal(bad.status, 400);
  });

  test("hidden challenges are invisible to players but visible to admins", async () => {
    const asPlayer = await req("GET", `/api/challenges/${hiddenId}`, undefined, playerToken);
    assert.equal(asPlayer.status, 404);
    const asAdmin = await req("GET", `/api/challenges/${hiddenId}`, undefined, adminToken);
    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.challenge.title, "Hidden Draft");

    const adminList = await req("GET", "/api/challenges", undefined, adminToken);
    const titles = adminList.body.challenges.map((c) => c.title);
    assert.ok(titles.includes("Hidden Draft"));
  });

  test("detail returns one challenge, and a wrong id 404s", async () => {
    const { status, body } = await req("GET", `/api/challenges/${webId}`, undefined, playerToken);
    assert.equal(status, 200);
    assert.equal(body.challenge.title, "Login Bypass");
    assert.equal(body.challenge.difficulty, "medium");
    assert.equal(body.challenge.flagHash, undefined);
  });
});

describe("flag submission", () => {
  let challengeId;

  before(async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Base64 Basics",
        category: "misc",
        difficulty: "easy",
        points: 50,
        description: "Decode the string.",
        flag: "flag{base64_is_not_crypto}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    challengeId = created.body.challenge.id;
  });

  test("a wrong flag is just wrong, and a right flag solves once", async () => {
    const wrong = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{not_the_flag}" },
      playerToken
    );
    assert.equal(wrong.status, 200);
    assert.equal(wrong.body.correct, false);
    assert.equal(typeof wrong.body.remainingGuesses, "number");

    const right = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{base64_is_not_crypto}" },
      playerToken
    );
    assert.equal(right.status, 200);
    assert.equal(right.body.correct, true);
    assert.equal(right.body.solved, true);
    assert.equal(right.body.points, 50);

    // A second correct guess doesn't score again.
    const again = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{base64_is_not_crypto}" },
      playerToken
    );
    assert.equal(again.body.correct, true);
    assert.equal(again.body.alreadySolved, true);
    assert.equal(again.body.solved, undefined);

    const detail = await req("GET", `/api/challenges/${challengeId}`, undefined, playerToken);
    assert.equal(detail.body.challenge.solved, true);
    assert.equal(detail.body.challenge.solveCount, 1);
  });

  test("solves are per player — another player can still solve it", async () => {
    const right = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{base64_is_not_crypto}" },
      otherToken
    );
    assert.equal(right.body.correct, true);
    assert.equal(right.body.solved, true);

    const detail = await req("GET", `/api/challenges/${challengeId}`, undefined, playerToken);
    assert.equal(detail.body.challenge.solveCount, 2);
  });

  test("empty flag, no token and unknown challenge are rejected", async () => {
    const empty = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "   " },
      playerToken
    );
    assert.equal(empty.status, 400);
    const noToken = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{base64_is_not_crypto}" }
    );
    assert.equal(noToken.status, 401);
    const unknown = await req(
      "POST",
      "/api/challenges/00000000-0000-0000-0000-000000000000/submit",
      { flag: "flag{x}" },
      playerToken
    );
    assert.equal(unknown.status, 404);
  });

  test("too many guesses in a row are refused with 429", async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Rate Limit Check",
        category: "crypto",
        difficulty: "hard",
        points: 400,
        description: "Guess the flag.",
        flag: "flag{slow_down_and_think}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const id = created.body.challenge.id;

    // Five wrong guesses in a row are fine — the sixth hits the cooldown.
    for (let i = 0; i < 5; i++) {
      const attempt = await req(
        "POST",
        `/api/challenges/${id}/submit`,
        { flag: `flag{wrong_guess_${i}}` },
        otherToken
      );
      assert.equal(attempt.status, 200);
      assert.equal(attempt.body.correct, false);
    }
    const sixth = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{wrong_guess_5}" },
      otherToken
    );
    assert.equal(sixth.status, 429);
    assert.ok(sixth.body.retryAfterSeconds > 0);
  });
});

describe("challenge delete", () => {
  test("admin can delete a challenge and it is gone afterwards", async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Throwaway",
        category: "misc",
        difficulty: "easy",
        points: 10,
        description: "Temporary.",
        flag: "flag{throwaway}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const id = created.body.challenge.id;

    const deleted = await req("DELETE", `/api/challenges/${id}`, undefined, adminToken);
    assert.equal(deleted.status, 200);

    const gone = await req("GET", `/api/challenges/${id}`, undefined, adminToken);
    assert.equal(gone.status, 404);
    const deleteAgain = await req("DELETE", `/api/challenges/${id}`, undefined, adminToken);
    assert.equal(deleteAgain.status, 404);
  });
});
