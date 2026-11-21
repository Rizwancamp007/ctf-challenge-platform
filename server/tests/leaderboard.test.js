import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { io } from "socket.io-client";
import { createApp } from "../src/app.js";
import { attachLiveSocket } from "../src/liveSocket.js";
import { hashPassword } from "../src/services/auth.js";
import { createMemoryChallengeStore } from "../src/store/challenges.js";
import { createMemorySolveStore } from "../src/store/solves.js";
import { createMemoryTeamStore } from "../src/store/teams.js";
import { createMemoryStore } from "../src/store/users.js";

process.env.JWT_SECRET = "test-secret-for-ctf-tests";
process.env.FLAG_SALT = "test-salt-for-ctf-tests";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("leaderboard and live feed", () => {
  let base;
  let server;
  let app;
  const store = createMemoryStore();
  const challengeStore = createMemoryChallengeStore();
  const solveStore = createMemorySolveStore();
  const teamStore = createMemoryTeamStore();

  async function loginAs(email, password) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(body)}`);
    return body;
  }

  let adminToken;
  const players = {};
  const challengeIds = {};

  before(async () => {
    app = createApp({ store, challengeStore, solveStore, teamStore });
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
    attachLiveSocket(server, app.locals.liveFeed);

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
    ]) {
      await store.create({
        name,
        email,
        passwordHash: await hashPassword("playerpass1"),
        role: "player",
      });
    }
    adminToken = (await loginAs("admin@example.com", "adminpass1")).token;
    for (const email of ["ayesha@example.com", "bilal@example.com", "daniyal@example.com"]) {
      const body = await loginAs(email, "playerpass1");
      players[email] = { token: body.token, id: body.user.id };
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

  async function makeChallenge(title, category, points, flag) {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title,
        category,
        difficulty: "easy",
        points,
        description: "Leaderboard check.",
        flag,
      },
      adminToken
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    challengeIds[title] = created.body.challenge.id;
    return created.body.challenge.id;
  }

  async function solve(title, email) {
    const res = await req(
      "POST",
      `/api/challenges/${challengeIds[title]}/submit`,
      { flag: `flag{${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}}` },
      players[email].token
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.correct, true, JSON.stringify(res.body));
    return res.body;
  }

  test("the board shows a category breakdown per solver", async () => {
    await makeChallenge("Crypto One", "crypto", 100, "flag{crypto_one}");
    await makeChallenge("Web One", "web", 100, "flag{web_one}");
    await makeChallenge("Crypto Two", "crypto", 50, "flag{crypto_two}");

    await solve("Crypto One", "ayesha@example.com");
    await sleep(15);
    await solve("Web One", "ayesha@example.com");
    await sleep(15);
    await solve("Crypto Two", "bilal@example.com");

    const board = await req("GET", "/api/leaderboard", undefined, players["ayesha@example.com"].token);
    assert.equal(board.status, 200);
    assert.equal(board.body.frozen, false);
    assert.equal(board.body.leaderboard.length, 2);

    // Ayesha: 100 + 25 first blood on Crypto One, 100 + 25 on Web One.
    const ayesha = board.body.leaderboard[0];
    assert.equal(ayesha.name, "Ayesha Khan");
    assert.equal(ayesha.rank, 1);
    assert.equal(ayesha.points, 250);
    assert.equal(ayesha.solves, 2);
    assert.equal(ayesha.firstBloods, 2);
    assert.deepEqual(ayesha.breakdown.crypto, { points: 125, solves: 1 });
    assert.deepEqual(ayesha.breakdown.web, { points: 125, solves: 1 });

    // Bilal: 50 + 25 first blood on Crypto Two.
    const bilal = board.body.leaderboard[1];
    assert.equal(bilal.name, "Bilal Ahmed");
    assert.equal(bilal.points, 75);
    assert.deepEqual(bilal.breakdown.crypto, { points: 75, solves: 1 });
    assert.equal(bilal.breakdown.web, undefined);
  });

  test("the feed records solves and first bloods", async () => {
    const feed = await req(
      "GET",
      "/api/leaderboard/feed",
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(feed.status, 200);
    const solves = feed.body.events.filter((e) => e.type === "solve");
    assert.ok(solves.length >= 3);
    const first = solves[0];
    assert.equal(first.solverName, "Ayesha Khan");
    assert.equal(first.challengeTitle, "Crypto One");
    assert.equal(first.firstBlood, true);
    assert.equal(first.points, 100);
    assert.equal(first.bonus, 25);
    // No flag, email or token ever lands in the feed.
    assert.equal(JSON.stringify(feed.body).includes("flag{"), false);

    const noToken = await req("GET", "/api/leaderboard/feed");
    assert.equal(noToken.status, 401);
  });

  test("a solve that moves the board records the position change", async () => {
    // Bilal is second on 75. A 200-point solve puts him first.
    await makeChallenge("Big Web", "web", 200, "flag{big_web}");
    await solve("Big Web", "bilal@example.com");

    const events = app.locals.liveFeed.recent(50);
    const boardEvents = events.filter((e) => e.type === "leaderboard");
    assert.ok(boardEvents.length >= 1);
    const last = boardEvents[boardEvents.length - 1];
    const bilalMove = last.moves.find((m) => m.name === "Bilal Ahmed");
    assert.ok(bilalMove, JSON.stringify(last.moves));
    assert.equal(bilalMove.from, 2);
    assert.equal(bilalMove.to, 1);
    assert.equal(last.standings[0].name, "Bilal Ahmed");

    const board = await req("GET", "/api/leaderboard", undefined, players["ayesha@example.com"].token);
    assert.equal(board.body.leaderboard[0].name, "Bilal Ahmed");
    assert.equal(board.body.leaderboard[1].name, "Ayesha Khan");
  });

  test("one solver's detail shows the breakdown and the solve timeline", async () => {
    const detail = await req(
      "GET",
      `/api/leaderboard/${players["ayesha@example.com"].id}`,
      undefined,
      players["bilal@example.com"].token
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.name, "Ayesha Khan");
    assert.equal(detail.body.rank, 2);
    assert.equal(detail.body.points, 250);
    assert.deepEqual(detail.body.breakdown.crypto, { points: 125, solves: 1 });
    assert.equal(detail.body.timeline.length, 2);
    assert.equal(detail.body.timeline[0].title, "Crypto One");
    assert.equal(detail.body.timeline[0].firstBlood, true);
    assert.equal(detail.body.timeline[0].solvedBy, "Ayesha Khan");
    assert.equal(detail.body.timeline[1].title, "Web One");

    const missing = await req(
      "GET",
      "/api/leaderboard/no-such-solver",
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(missing.status, 404);
  });

  test("freezing holds the public board while admins still see it live", async () => {
    const freeze = await req(
      "POST",
      "/api/leaderboard/freeze",
      {},
      adminToken
    );
    assert.equal(freeze.status, 200);
    assert.equal(freeze.body.frozen, true);
    assert.equal(freeze.body.leaderboard[0].name, "Bilal Ahmed");

    // Daniyal solves while the board is frozen.
    await makeChallenge("Frozen Check", "misc", 100, "flag{frozen_check}");
    await solve("Frozen Check", "daniyal@example.com");

    // Players still see the frozen standings — Daniyal is not on them.
    const playerBoard = await req(
      "GET",
      "/api/leaderboard",
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(playerBoard.body.frozen, true);
    assert.equal(playerBoard.body.leaderboard.length, 2);
    assert.equal(
      playerBoard.body.leaderboard.some((e) => e.name === "Daniyal Raza"),
      false
    );

    // Admins see the live board, with the freeze flagged.
    const adminBoard = await req("GET", "/api/leaderboard", undefined, adminToken);
    assert.equal(adminBoard.body.frozen, true);
    assert.equal(adminBoard.body.leaderboard.length, 3);
    assert.equal(
      adminBoard.body.leaderboard.some((e) => e.name === "Daniyal Raza"),
      true
    );

    // Only admins can freeze or unfreeze.
    const playerFreeze = await req(
      "POST",
      "/api/leaderboard/freeze",
      {},
      players["ayesha@example.com"].token
    );
    assert.equal(playerFreeze.status, 403);

    const unfreeze = await req("POST", "/api/leaderboard/unfreeze", {}, adminToken);
    assert.equal(unfreeze.status, 200);
    assert.equal(unfreeze.body.frozen, false);

    const liveAgain = await req(
      "GET",
      "/api/leaderboard",
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(liveAgain.body.frozen, false);
    assert.equal(liveAgain.body.leaderboard.length, 3);
  });

  test("a connected socket gets the solve as it happens", async () => {
    const socket = io(base, { transports: ["websocket", "polling"] });
    try {
      // The recent feed arrives on connect, so listen before the handshake.
      const feedPromise = new Promise((resolve, reject) => {
        socket.on("feed", resolve);
        setTimeout(() => reject(new Error("no feed on connect")), 5000);
      });
      await new Promise((resolve, reject) => {
        socket.on("connect", resolve);
        socket.on("connect_error", reject);
        setTimeout(() => reject(new Error("socket did not connect")), 5000);
      });
      const feed = await feedPromise;
      assert.ok(Array.isArray(feed));
      assert.ok(feed.some((e) => e.type === "solve"));

      const solveEvent = new Promise((resolve, reject) => {
        socket.on("event", (event) => {
          if (event.type === "solve" && event.challengeTitle === "Socket Check") {
            resolve(event);
          }
        });
        setTimeout(() => reject(new Error("no live solve event")), 5000);
      });
      await makeChallenge("Socket Check", "reverse", 100, "flag{socket_check}");
      await solve("Socket Check", "ayesha@example.com");
      const event = await solveEvent;
      assert.equal(event.solverName, "Ayesha Khan");
      assert.equal(event.firstBlood, true);
      assert.equal(event.points, 100);
    } finally {
      socket.disconnect();
    }
  });
});
