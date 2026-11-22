import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/services/auth.js";
import { createMemoryChallengeStore } from "../src/store/challenges.js";
import { createMemoryHintStore, createMemoryUnlockStore } from "../src/store/hints.js";
import { createMemorySolveStore } from "../src/store/solves.js";
import { createMemoryTeamStore } from "../src/store/teams.js";
import { createMemoryStore } from "../src/store/users.js";

process.env.JWT_SECRET = "test-secret-for-ctf-tests";
process.env.FLAG_SALT = "test-salt-for-ctf-tests";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("hints and containerised challenges", () => {
  let base;
  let server;
  let app;
  const store = createMemoryStore();
  const challengeStore = createMemoryChallengeStore();
  const solveStore = createMemorySolveStore();
  const teamStore = createMemoryTeamStore();
  const hintStore = createMemoryHintStore();
  const unlockStore = createMemoryUnlockStore();

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
  let challengeId;
  const hintIds = {};

  before(async () => {
    app = createApp({ store, challengeStore, solveStore, teamStore, hintStore, unlockStore });
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

  test("admins manage hints and players cannot", async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Hinted Crypto",
        category: "crypto",
        difficulty: "easy",
        points: 100,
        description: "Hint checks.",
        flag: "flag{hinted_crypto}",
      },
      adminToken
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    challengeId = created.body.challenge.id;

    const hintOne = await req(
      "POST",
      `/api/challenges/${challengeId}/hints`,
      { text: "Look at the first bytes of the file.", cost: 20, order: 0 },
      adminToken
    );
    assert.equal(hintOne.status, 201, JSON.stringify(hintOne.body));
    assert.equal(hintOne.body.hint.text, "Look at the first bytes of the file.");
    assert.equal(hintOne.body.hint.cost, 20);
    hintIds.one = hintOne.body.hint.id;

    const hintTwo = await req(
      "POST",
      `/api/challenges/${challengeId}/hints`,
      { text: "The answer is in the header.", cost: 30, order: 1 },
      adminToken
    );
    assert.equal(hintTwo.status, 201);
    hintIds.two = hintTwo.body.hint.id;

    // Players see the cost but not the text of a locked hint.
    const playerList = await req(
      "GET",
      `/api/challenges/${challengeId}/hints`,
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(playerList.status, 200);
    assert.equal(playerList.body.hints.length, 2);
    assert.equal(playerList.body.hints[0].unlocked, false);
    assert.equal(playerList.body.hints[0].cost, 20);
    assert.equal(playerList.body.hints[0].text, undefined);

    // Players cannot create, edit or delete hints.
    const playerCreate = await req(
      "POST",
      `/api/challenges/${challengeId}/hints`,
      { text: "Sneaky.", cost: 1 },
      players["ayesha@example.com"].token
    );
    assert.equal(playerCreate.status, 403);
    const playerDelete = await req(
      "DELETE",
      `/api/challenges/${challengeId}/hints/${hintIds.one}`,
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(playerDelete.status, 403);

    // Bad hint input is rejected.
    const negativeCost = await req(
      "POST",
      `/api/challenges/${challengeId}/hints`,
      { text: "Too cheap.", cost: -5 },
      adminToken
    );
    assert.equal(negativeCost.status, 400);
    const tooDear = await req(
      "POST",
      `/api/challenges/${challengeId}/hints`,
      { text: "Too dear.", cost: 501 },
      adminToken
    );
    assert.equal(tooDear.status, 400);
    const noText = await req(
      "POST",
      `/api/challenges/${challengeId}/hints`,
      { text: "  ", cost: 10 },
      adminToken
    );
    assert.equal(noText.status, 400);

    // Admins can change a hint's price.
    const updated = await req(
      "PUT",
      `/api/challenges/${challengeId}/hints/${hintIds.two}`,
      { cost: 25 },
      adminToken
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.hint.cost, 25);

    const missing = await req(
      "GET",
      "/api/challenges/no-such-challenge/hints",
      undefined,
      adminToken
    );
    assert.equal(missing.status, 404);
  });

  test("a hint costs points and unlocks for the whole team", async () => {
    // Ayesha and Bilal form a team; Daniyal plays alone.
    const team = await req(
      "POST",
      "/api/teams",
      { name: "Hint Hunters" },
      players["ayesha@example.com"].token
    );
    assert.equal(team.status, 201, JSON.stringify(team.body));
    const joined = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: team.body.team.inviteCode },
      players["bilal@example.com"].token
    );
    assert.equal(joined.status, 200, JSON.stringify(joined.body));

    // No points yet — the hint is out of reach.
    const broke = await req(
      "POST",
      `/api/challenges/${challengeId}/hints/${hintIds.one}/unlock`,
      {},
      players["ayesha@example.com"].token
    );
    assert.equal(broke.status, 402);
    assert.equal(broke.body.needed, 20);
    assert.equal(broke.body.current, 0);

    // Ayesha solves: 100 points + 25 first blood.
    const solve = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{hinted_crypto}" },
      players["ayesha@example.com"].token
    );
    assert.equal(solve.status, 200, JSON.stringify(solve.body));
    assert.equal(solve.body.correct, true);

    // Unlocking takes 20 off the team's 125.
    const unlocked = await req(
      "POST",
      `/api/challenges/${challengeId}/hints/${hintIds.one}/unlock`,
      {},
      players["ayesha@example.com"].token
    );
    assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));
    assert.equal(unlocked.body.alreadyUnlocked, false);
    assert.equal(unlocked.body.pointsDeducted, 20);
    assert.equal(unlocked.body.remainingScore, 105);
    assert.equal(unlocked.body.hint.text, "Look at the first bytes of the file.");

    // The board shows the deduction.
    const board = await req("GET", "/api/leaderboard", undefined, adminToken);
    assert.equal(board.status, 200);
    const hunters = board.body.leaderboard.find((e) => e.name === "Hint Hunters");
    assert.ok(hunters, JSON.stringify(board.body.leaderboard));
    assert.equal(hunters.points, 105);
    assert.equal(hunters.hintCosts, 20);

    // Bilal, on the same team, sees the hint already unlocked — and
    // unlocking again costs nothing.
    const bilalList = await req(
      "GET",
      `/api/challenges/${challengeId}/hints`,
      undefined,
      players["bilal@example.com"].token
    );
    assert.equal(bilalList.body.hints[0].unlocked, true);
    assert.equal(bilalList.body.hints[0].text, "Look at the first bytes of the file.");
    const again = await req(
      "POST",
      `/api/challenges/${challengeId}/hints/${hintIds.one}/unlock`,
      {},
      players["bilal@example.com"].token
    );
    assert.equal(again.status, 200);
    assert.equal(again.body.alreadyUnlocked, true);
    assert.equal(again.body.pointsDeducted, 0);
    assert.equal(again.body.remainingScore, 105);

    // Daniyal, playing alone, still sees it locked and cannot afford it.
    const daniyalList = await req(
      "GET",
      `/api/challenges/${challengeId}/hints`,
      undefined,
      players["daniyal@example.com"].token
    );
    assert.equal(daniyalList.body.hints[0].unlocked, false);
    assert.equal(daniyalList.body.hints[0].text, undefined);
    const daniyalUnlock = await req(
      "POST",
      `/api/challenges/${challengeId}/hints/${hintIds.one}/unlock`,
      {},
      players["daniyal@example.com"].token
    );
    assert.equal(daniyalUnlock.status, 402);
  });

  test("a solo player's unlock only charges that player", async () => {
    // Daniyal solves a challenge of his own, then unlocks the same hint
    // — his 125 pays for it, the team's 105 is untouched.
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Solo Crypto",
        category: "crypto",
        difficulty: "easy",
        points: 100,
        description: "Solo check.",
        flag: "flag{solo_crypto}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const soloId = created.body.challenge.id;
    const solve = await req(
      "POST",
      `/api/challenges/${soloId}/submit`,
      { flag: "flag{solo_crypto}" },
      players["daniyal@example.com"].token
    );
    assert.equal(solve.status, 200);
    assert.equal(solve.body.correct, true);

    const unlocked = await req(
      "POST",
      `/api/challenges/${challengeId}/hints/${hintIds.one}/unlock`,
      {},
      players["daniyal@example.com"].token
    );
    assert.equal(unlocked.status, 200);
    assert.equal(unlocked.body.remainingScore, 105);

    const board = await req("GET", "/api/leaderboard", undefined, adminToken);
    const hunters = board.body.leaderboard.find((e) => e.name === "Hint Hunters");
    const daniyal = board.body.leaderboard.find((e) => e.name === "Daniyal Raza");
    assert.equal(hunters.points, 105);
    assert.equal(daniyal.points, 105);
    assert.equal(daniyal.hintCosts, 20);
  });

  test("deleting a hint removes it and its unlocks", async () => {
    const deleted = await req(
      "DELETE",
      `/api/challenges/${challengeId}/hints/${hintIds.two}`,
      undefined,
      adminToken
    );
    assert.equal(deleted.status, 200);
    const list = await req(
      "GET",
      `/api/challenges/${challengeId}/hints`,
      undefined,
      adminToken
    );
    assert.equal(list.body.hints.length, 1);
    assert.equal(list.body.hints[0].id, hintIds.one);

    const gone = await req(
      "POST",
      `/api/challenges/${challengeId}/hints/${hintIds.two}/unlock`,
      {},
      players["ayesha@example.com"].token
    );
    assert.equal(gone.status, 404);
  });

  test("the admin container status view checks each service", async () => {
    // A challenge with no container is reported as not configured.
    const noContainer = await req("GET", "/api/containers", undefined, adminToken);
    assert.equal(noContainer.status, 200);
    const hinted = noContainer.body.containers.find(
      (c) => c.challengeId === challengeId
    );
    assert.ok(hinted);
    assert.equal(hinted.status, "not-configured");
    assert.equal(hinted.url, null);

    // Players cannot see container status.
    const playerStatus = await req(
      "GET",
      "/api/containers",
      undefined,
      players["ayesha@example.com"].token
    );
    assert.equal(playerStatus.status, 403);

    // Point a challenge at a live health endpoint and a dead one.
    const liveServer = await startProbeServer();
    try {
      const liveChallenge = await req(
        "POST",
        "/api/challenges",
        {
          title: "Live Web",
          category: "web",
          difficulty: "easy",
          points: 100,
          description: "Status check.",
          flag: "flag{live_web}",
          container: { image: "ctf/web-hidden-flag", port: 3000, url: liveServer.url },
        },
        adminToken
      );
      assert.equal(liveChallenge.status, 201, JSON.stringify(liveChallenge.body));
      const deadChallenge = await req(
        "POST",
        "/api/challenges",
        {
          title: "Dead Web",
          category: "web",
          difficulty: "easy",
          points: 100,
          description: "Status check.",
          flag: "flag{dead_web}",
          container: { image: "ctf/web-hidden-flag", port: 3000, url: "http://127.0.0.1:9" },
        },
        adminToken
      );
      assert.equal(deadChallenge.status, 201);

      const status = await req("GET", "/api/containers", undefined, adminToken);
      assert.equal(status.status, 200);
      const live = status.body.containers.find(
        (c) => c.challengeId === liveChallenge.body.challenge.id
      );
      const dead = status.body.containers.find(
        (c) => c.challengeId === deadChallenge.body.challenge.id
      );
      assert.equal(live.status, "up");
      assert.equal(dead.status, "down");
    } finally {
      await liveServer.close();
    }
  });

  test("the bundled web challenges boot and serve their flags", async () => {
    const flag = "flag{container_boot_check}";
    for (const [folder, port] of [
      ["web-hidden-flag", 45671],
      ["web-source-leak", 45672],
    ]) {
      const serverPath = join(repoRoot, "docker", folder, "server.js");
      const dockerfile = await readFile(join(repoRoot, "docker", folder, "Dockerfile"), "utf8");
      const source = await readFile(serverPath, "utf8");
      // The flag is never in the image or the code — it only arrives
      // through the environment at run time.
      assert.equal(dockerfile.includes(flag), false);
      assert.equal(source.includes(flag), false);
      assert.ok(source.includes("process.env.FLAG"));

      const child = spawn("node", [serverPath], {
        env: { ...process.env, FLAG: flag, PORT: String(port) },
        stdio: "ignore",
      });
      try {
        const baseUrl = `http://127.0.0.1:${port}`;
        let healthy = false;
        for (let i = 0; i < 50; i++) {
          try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) {
              healthy = true;
              break;
            }
          } catch {
            // Not up yet.
          }
          await sleep(100);
        }
        assert.equal(healthy, true, `${folder} did not answer /health`);

        if (folder === "web-hidden-flag") {
          const robots = await (await fetch(`${baseUrl}/robots.txt`)).text();
          assert.ok(robots.includes("/hidden/"));
          const flagText = await (await fetch(`${baseUrl}/hidden/flag.txt`)).text();
          assert.equal(flagText.trim(), flag);
        } else {
          const appJs = await (await fetch(`${baseUrl}/app.js`)).text();
          const match = appJs.match(/Build info, left in by mistake:\n\/\/ ([A-Za-z0-9+/=]+)/);
          assert.ok(match, "no encoded flag in /app.js");
          const decoded = Buffer.from(match[1], "base64").toString("utf8");
          assert.equal(decoded, flag);
          // The plain flag never appears in the page or its script.
          assert.equal(appJs.includes(flag), false);
        }
      } finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.on("exit", resolve));
      }
    }
  });
});

// A tiny stand-in for a challenge container: answers /health with ok.
async function startProbeServer() {
  const { createServer } = await import("node:http");
  const probe = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${probe.address().port}`;
  return {
    url,
    close: () => new Promise((resolve) => probe.close(resolve)),
  };
}
