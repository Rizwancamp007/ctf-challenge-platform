import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/services/auth.js";
import { createGuessLimiter } from "../src/services/guessLimiter.js";
import { computeStandings } from "../src/services/scoreboard.js";
import {
  FIRST_BLOOD_BONUS,
  challengeValue,
  minPointsFor,
  pointsForSolve,
  rankStandings,
} from "../src/services/scoring.js";
import { createMemoryChallengeStore } from "../src/store/challenges.js";
import { createMemorySolveStore } from "../src/store/solves.js";
import { createMemoryStore } from "../src/store/users.js";

process.env.JWT_SECRET = "test-secret-for-ctf-tests";
process.env.FLAG_SALT = "test-salt-for-ctf-tests";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("scoring math", () => {
  test("the floor is a quarter of the base, never less than 10", () => {
    assert.equal(minPointsFor(100), 25);
    assert.equal(minPointsFor(50), 13);
    assert.equal(minPointsFor(10), 10);
    assert.equal(minPointsFor(1000), 250);
  });

  test("the first solve is worth full base points, then the value falls towards the floor", () => {
    assert.equal(challengeValue({ basePoints: 100, solveCount: 0 }), 100);
    assert.equal(challengeValue({ basePoints: 100, solveCount: 1 }), 88);
    assert.equal(challengeValue({ basePoints: 100, solveCount: 2 }), 79);
    assert.equal(challengeValue({ basePoints: 100, solveCount: 5 }), 63);
    assert.equal(challengeValue({ basePoints: 100, solveCount: 10 }), 50);
    assert.equal(challengeValue({ basePoints: 100, solveCount: 100 }), 29);
    assert.equal(challengeValue({ basePoints: 100, solveCount: 1000 }), 25);
  });

  test("the value never drops below the floor, and a tiny challenge stays flat", () => {
    for (const solves of [0, 1, 5, 50, 500]) {
      assert.ok(challengeValue({ basePoints: 100, solveCount: solves }) >= 25);
      assert.equal(challengeValue({ basePoints: 10, solveCount: solves }), 10);
    }
  });

  test("the value falls monotonically as more solvers crack it", () => {
    let previous = Infinity;
    for (let solves = 0; solves <= 20; solves++) {
      const value = challengeValue({ basePoints: 200, solveCount: solves });
      assert.ok(value <= previous);
      previous = value;
    }
  });

  test("only the first solve earns the first-blood bonus", () => {
    const first = pointsForSolve({ basePoints: 100, solveCount: 0 });
    assert.equal(first.value, 100);
    assert.equal(first.firstBlood, true);
    assert.equal(first.bonus, FIRST_BLOOD_BONUS);
    assert.equal(FIRST_BLOOD_BONUS, 25);

    const second = pointsForSolve({ basePoints: 100, solveCount: 1 });
    assert.equal(second.value, 88);
    assert.equal(second.firstBlood, false);
    assert.equal(second.bonus, 0);
  });
});

describe("standings", () => {
  test("totals add points and bonus, and ties break on the earliest last solve", () => {
    const entries = [
      { solverId: "b", points: 100, solves: 1, firstBloods: 1, lastSolveAt: new Date("2026-11-19T10:00:00Z") },
      { solverId: "a", points: 100, solves: 1, firstBloods: 0, lastSolveAt: new Date("2026-11-19T09:00:00Z") },
      { solverId: "c", points: 50, solves: 1, firstBloods: 0, lastSolveAt: new Date("2026-11-19T08:00:00Z") },
    ];
    const ranked = rankStandings(entries);
    assert.equal(ranked[0].solverId, "a");
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].solverId, "b");
    assert.equal(ranked[1].rank, 2);
    assert.equal(ranked[2].solverId, "c");
    assert.equal(ranked[2].rank, 3);
  });

  test("computeStandings totals solves per solver, counting the bonus", () => {
    const solves = [
      { userId: "u1", teamId: null, points: 100, bonus: 25, firstBlood: true, createdAt: new Date("2026-11-19T09:00:00Z") },
      { userId: "u2", teamId: null, points: 88, bonus: 0, firstBlood: false, createdAt: new Date("2026-11-19T09:05:00Z") },
      { userId: "u1", teamId: null, points: 79, bonus: 0, firstBlood: false, createdAt: new Date("2026-11-19T09:10:00Z") },
    ];
    const standings = computeStandings(solves);
    assert.equal(standings.length, 2);
    assert.equal(standings[0].solverId, "u1");
    assert.equal(standings[0].points, 204);
    assert.equal(standings[0].solves, 2);
    assert.equal(standings[0].firstBloods, 1);
    assert.equal(standings[1].solverId, "u2");
    assert.equal(standings[1].points, 88);
  });
});

describe("wrong-guess cooldown", () => {
  test("a run of wrong guesses earns a cooldown, a right guess clears it", () => {
    const limiter = createGuessLimiter({
      windowMs: 60_000,
      max: 10,
      wrongBeforeCooldown: 3,
      cooldownMs: 60_000,
    });
    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.check("team-a").allowed, true);
      limiter.recordWrong("team-a");
    }
    const blocked = limiter.check("team-a");
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
    // A different solver is unaffected.
    assert.equal(limiter.check("team-b").allowed, true);
    // A correct guess clears the streak.
    limiter.recordCorrect("team-a");
    assert.equal(limiter.check("team-a").allowed, true);
  });
});

describe("scoring over the API", () => {
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
  const playerTokens = {};

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
    for (const [name, email] of [
      ["Ayesha Khan", "ayesha@example.com"],
      ["Bilal Ahmed", "bilal@example.com"],
      ["Daniyal Raza", "daniyal@example.com"],
      ["Emaan Fatima", "emaan@example.com"],
    ]) {
      await store.create({
        name,
        email,
        passwordHash: await hashPassword("playerpass1"),
        role: "player",
      });
    }
    adminToken = await loginAs("admin@example.com", "adminpass1");
    for (const email of ["ayesha@example.com", "bilal@example.com", "daniyal@example.com", "emaan@example.com"]) {
      playerTokens[email] = await loginAs(email, "playerpass1");
    }
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

  test("a solve is worth the live value plus the first-blood bonus, then the value falls", async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Scoring Check",
        category: "crypto",
        difficulty: "easy",
        points: 100,
        description: "Watch the value fall.",
        flag: "flag{scoring_check}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const id = created.body.challenge.id;

    const first = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{scoring_check}" },
      playerTokens["ayesha@example.com"]
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.correct, true);
    assert.equal(first.body.solved, true);
    assert.equal(first.body.points, 100);
    assert.equal(first.body.firstBlood, true);
    assert.equal(first.body.bonus, 25);

    // The list now shows the fallen value, and first blood is gone.
    const list = await req("GET", "/api/challenges", undefined, playerTokens["bilal@example.com"]);
    const shown = list.body.challenges.find((c) => c.id === id);
    assert.equal(shown.currentPoints, 88);
    assert.equal(shown.firstBloodAvailable, false);
    assert.equal(shown.solveCount, 1);

    const second = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{scoring_check}" },
      playerTokens["bilal@example.com"]
    );
    assert.equal(second.body.points, 88);
    assert.equal(second.body.firstBlood, false);
    assert.equal(second.body.bonus, 0);

    const third = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{scoring_check}" },
      playerTokens["daniyal@example.com"]
    );
    assert.equal(third.body.points, 79);
    assert.equal(third.body.firstBlood, false);

    // Solving again doesn't score twice.
    const again = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{scoring_check}" },
      playerTokens["ayesha@example.com"]
    );
    assert.equal(again.body.alreadySolved, true);
  });

  test("the leaderboard ranks by total points, ties break on the earlier last solve", async () => {
    // Ayesha 125 (100 + 25 bonus), Bilal 88, Daniyal 79 from the challenge above.
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Tie Break Check",
        category: "web",
        difficulty: "easy",
        points: 100,
        description: "Same value, later solve.",
        flag: "flag{tie_break_check}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const id = created.body.challenge.id;

    await sleep(15);
    const emaan = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{tie_break_check}" },
      playerTokens["emaan@example.com"]
    );
    assert.equal(emaan.body.points, 100);
    assert.equal(emaan.body.firstBlood, true);

    const board = await req("GET", "/api/leaderboard", undefined, playerTokens["ayesha@example.com"]);
    assert.equal(board.status, 200);
    assert.ok(Array.isArray(board.body.leaderboard));
    const names = board.body.leaderboard.map((e) => e.name);
    assert.deepEqual(names, ["Ayesha Khan", "Emaan Fatima", "Bilal Ahmed", "Daniyal Raza"]);

    const [first, second] = board.body.leaderboard;
    assert.equal(first.points, 125);
    assert.equal(first.rank, 1);
    assert.equal(first.solves, 1);
    assert.equal(first.firstBloods, 1);
    // Emaan also has 125, but Ayesha reached it first.
    assert.equal(second.points, 125);
    assert.equal(second.rank, 2);
    assert.ok(new Date(first.lastSolveAt) < new Date(second.lastSolveAt));
    assert.equal(board.body.leaderboard[2].points, 88);
    assert.equal(board.body.leaderboard[3].points, 79);

    const noToken = await req("GET", "/api/leaderboard");
    assert.equal(noToken.status, 401);
  });

  test("five wrong guesses in a row earn a cooldown over the API", async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Cooldown Check",
        category: "misc",
        difficulty: "easy",
        points: 50,
        description: "Guess wrong on purpose.",
        flag: "flag{cooldown_check}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const id = created.body.challenge.id;

    for (let i = 0; i < 5; i++) {
      const attempt = await req(
        "POST",
        `/api/challenges/${id}/submit`,
        { flag: `flag{wrong_${i}}` },
        playerTokens["emaan@example.com"]
      );
      assert.equal(attempt.status, 200);
      assert.equal(attempt.body.correct, false);
    }
    const sixth = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{wrong_5}" },
      playerTokens["emaan@example.com"]
    );
    assert.equal(sixth.status, 429);
    assert.ok(sixth.body.retryAfterSeconds > 0);
  });
});
