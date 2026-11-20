import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/services/auth.js";
import { createMemoryChallengeStore } from "../src/store/challenges.js";
import { createMemorySolveStore } from "../src/store/solves.js";
import { createMemoryTeamStore } from "../src/store/teams.js";
import { createMemoryStore } from "../src/store/users.js";

process.env.JWT_SECRET = "test-secret-for-ctf-tests";
process.env.FLAG_SALT = "test-salt-for-ctf-tests";

let base;
let server;
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
  return body.token;
}

async function me(token) {
  const res = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body.user;
}

const players = [
  { name: "Ayesha Khan", email: "ayesha@example.com" },
  { name: "Bilal Ahmed", email: "bilal@example.com" },
  { name: "Hassan Raza", email: "hassan@example.com" },
  { name: "Sara Malik", email: "sara@example.com" },
  { name: "Omar Farooq", email: "omar@example.com" },
  { name: "Zainab Ali", email: "zainab@example.com" },
];
let adminToken;
const tokens = {};
const ids = {};

before(async () => {
  const app = createApp({ store, challengeStore, solveStore, teamStore });
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
  for (const p of players) {
    await store.create({
      name: p.name,
      email: p.email,
      passwordHash: await hashPassword("playerpass1"),
      role: "player",
    });
  }
  adminToken = await loginAs("admin@example.com", "adminpass1");
  for (const p of players) {
    tokens[p.email] = await loginAs(p.email, "playerpass1");
    ids[p.email] = (await me(tokens[p.email])).id;
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

const ayesha = () => tokens["ayesha@example.com"];
const bilal = () => tokens["bilal@example.com"];
const hassan = () => tokens["hassan@example.com"];
const sara = () => tokens["sara@example.com"];
const omar = () => tokens["omar@example.com"];
const zainab = () => tokens["zainab@example.com"];

let teamAId;
let teamACode;
let teamBId;

describe("team creation and joining", () => {
  test("captain creates a team and gets an invite code", async () => {
    const { status, body } = await req(
      "POST",
      "/api/teams",
      { name: "Byte Force" },
      ayesha()
    );
    assert.equal(status, 201);
    assert.equal(body.team.name, "Byte Force");
    assert.equal(body.team.captainId, ids["ayesha@example.com"]);
    assert.equal(body.team.memberCount, 1);
    assert.deepEqual(body.team.memberIds, [ids["ayesha@example.com"]]);
    assert.equal(typeof body.team.inviteCode, "string");
    assert.equal(body.team.inviteCode.length, 8);
    assert.equal(body.team.score, 0);
    assert.deepEqual(body.team.solves, []);
    teamAId = body.team.id;
    teamACode = body.team.inviteCode;

    // The account now knows it is on a team.
    const mine = await me(ayesha());
    assert.equal(mine.teamId, teamAId);
  });

  test("a second team is created for the join-rejection tests", async () => {
    const { status, body } = await req(
      "POST",
      "/api/teams",
      { name: "Null Pointers" },
      hassan()
    );
    assert.equal(status, 201);
    teamBId = body.team.id;
  });

  test("creating while on a team, and an empty name, are rejected", async () => {
    const again = await req("POST", "/api/teams", { name: "Another" }, ayesha());
    assert.equal(again.status, 409);
    const empty = await req("POST", "/api/teams", { name: "   " }, sara());
    assert.equal(empty.status, 400);
    const noToken = await req("POST", "/api/teams", { name: "Nope" });
    assert.equal(noToken.status, 401);
  });

  test("joining by invite code works, and the rejections hold", async () => {
    const badCode = await req("POST", "/api/teams/join", { inviteCode: "NOPE1234" }, bilal());
    assert.equal(badCode.status, 404);

    const joined = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: teamACode },
      bilal()
    );
    assert.equal(joined.status, 200);
    assert.equal(joined.body.team.memberCount, 2);

    // Already on a team — can't join a second one.
    const second = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: teamACode },
      bilal()
    );
    assert.equal(second.status, 409);

    // Fill the team to four — Sara joins with a lowercase code, which
    // still matches — then Omar.
    const saraJoined = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: teamACode.toLowerCase() },
      sara()
    );
    assert.equal(saraJoined.status, 200);
    assert.equal(saraJoined.body.team.memberCount, 3);
    const omarJoined = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: teamACode },
      omar()
    );
    assert.equal(omarJoined.status, 200);
    assert.equal(omarJoined.body.team.memberCount, 4);

    // A fifth player is turned away.
    const full = await req("POST", "/api/teams/join", { inviteCode: teamACode }, zainab());
    assert.equal(full.status, 409);
  });
});

describe("team profile and admin list", () => {
  test("members see the full profile, strangers don't see the invite code", async () => {
    const mine = await req("GET", "/api/teams/me", undefined, bilal());
    assert.equal(mine.status, 200);
    assert.equal(mine.body.team.name, "Byte Force");
    assert.equal(mine.body.team.inviteCode, teamACode);
    assert.equal(mine.body.team.members.length, 4);
    assert.ok(mine.body.team.members.every((m) => m.name && m.email));

    // Hassan captains the other team — he can see the profile but not
    // the code that lets people in.
    const stranger = await req("GET", `/api/teams/${teamAId}`, undefined, hassan());
    assert.equal(stranger.status, 200);
    assert.equal(stranger.body.team.inviteCode, undefined);
    assert.equal(stranger.body.team.members.length, 4);

    const unknown = await req(
      "GET",
      "/api/teams/00000000-0000-0000-0000-000000000000",
      undefined,
      bilal()
    );
    assert.equal(unknown.status, 404);
    const noTeam = await req("GET", "/api/teams/me", undefined, zainab());
    assert.equal(noTeam.status, 404);
  });

  test("admins list every team, players cannot", async () => {
    const asAdmin = await req("GET", "/api/teams", undefined, adminToken);
    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.teams.length, 2);
    const asPlayer = await req("GET", "/api/teams", undefined, ayesha());
    assert.equal(asPlayer.status, 403);
  });
});

describe("roster management", () => {
  test("only the captain kicks, and a kicked player is out", async () => {
    const byMember = await req(
      "POST",
      `/api/teams/${teamAId}/kick`,
      { userId: ids["omar@example.com"] },
      bilal()
    );
    assert.equal(byMember.status, 403);

    const kicked = await req(
      "POST",
      `/api/teams/${teamAId}/kick`,
      { userId: ids["omar@example.com"] },
      ayesha()
    );
    assert.equal(kicked.status, 200);
    assert.equal(kicked.body.team.memberCount, 3);
    assert.ok(
      !kicked.body.team.memberIds.includes(ids["omar@example.com"])
    );
    const omarMe = await me(omar());
    assert.equal(omarMe.teamId, null);
    const omarTeam = await req("GET", "/api/teams/me", undefined, omar());
    assert.equal(omarTeam.status, 404);

    const kickSelf = await req(
      "POST",
      `/api/teams/${teamAId}/kick`,
      { userId: ids["ayesha@example.com"] },
      ayesha()
    );
    assert.equal(kickSelf.status, 400);
    const kickStranger = await req(
      "POST",
      `/api/teams/${teamAId}/kick`,
      { userId: ids["zainab@example.com"] },
      ayesha()
    );
    assert.equal(kickStranger.status, 400);
  });

  test("captaincy passes to another member, and only the captain hands it over", async () => {
    const byMember = await req(
      "POST",
      `/api/teams/${teamAId}/transfer`,
      { userId: ids["sara@example.com"] },
      bilal()
    );
    assert.equal(byMember.status, 403);

    const transferred = await req(
      "POST",
      `/api/teams/${teamAId}/transfer`,
      { userId: ids["bilal@example.com"] },
      ayesha()
    );
    assert.equal(transferred.status, 200);
    assert.equal(transferred.body.team.captainId, ids["bilal@example.com"]);

    // Ayesha is a plain member now — she can't kick any more.
    const noLonger = await req(
      "POST",
      `/api/teams/${teamAId}/kick`,
      { userId: ids["sara@example.com"] },
      ayesha()
    );
    assert.equal(noLonger.status, 403);

    const toSelf = await req(
      "POST",
      `/api/teams/${teamAId}/transfer`,
      { userId: ids["bilal@example.com"] },
      bilal()
    );
    assert.equal(toSelf.status, 400);
    const toStranger = await req(
      "POST",
      `/api/teams/${teamAId}/transfer`,
      { userId: ids["zainab@example.com"] },
      bilal()
    );
    assert.equal(toStranger.status, 400);
  });

  test("regenerating the invite code retires the old one", async () => {
    const oldCode = teamACode;
    const { status, body } = await req(
      "POST",
      `/api/teams/${teamAId}/regenerate-code`,
      {},
      bilal()
    );
    assert.equal(status, 200);
    assert.notEqual(body.team.inviteCode, oldCode);
    assert.equal(body.team.inviteCode.length, 8);
    teamACode = body.team.inviteCode;

    const retired = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: oldCode },
      omar()
    );
    assert.equal(retired.status, 404);

    // Omar rejoins with the fresh code.
    const rejoined = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: teamACode },
      omar()
    );
    assert.equal(rejoined.status, 200);
    assert.equal(rejoined.body.team.memberCount, 4);
  });
});

describe("team solves and scoring", () => {
  let challengeId;

  before(async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Team Solve Test",
        category: "misc",
        difficulty: "easy",
        points: 100,
        description: "Solve it once for the whole team.",
        flag: "flag{team_solves_once}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    challengeId = created.body.challenge.id;
  });

  test("a solve counts once per team, whoever submits the flag", async () => {
    const first = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{team_solves_once}" },
      bilal()
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.correct, true);
    assert.equal(first.body.solved, true);
    assert.equal(first.body.points, 100);
    assert.equal(first.body.firstBlood, true);

    // A teammate's correct flag is the same solve, not a second one.
    const teammate = await req(
      "POST",
      `/api/challenges/${challengeId}/submit`,
      { flag: "flag{team_solves_once}" },
      sara()
    );
    assert.equal(teammate.body.correct, true);
    assert.equal(teammate.body.alreadySolved, true);
    assert.equal(teammate.body.solved, undefined);

    const detail = await req(
      "GET",
      `/api/challenges/${challengeId}`,
      undefined,
      sara()
    );
    assert.equal(detail.body.challenge.solved, true);
    assert.equal(detail.body.challenge.solveCount, 1);

    // The team profile shows the solve, its points and who submitted it.
    const profile = await req("GET", "/api/teams/me", undefined, ayesha());
    assert.equal(profile.body.team.score, 125);
    assert.equal(profile.body.team.solveCount, 1);
    assert.equal(profile.body.team.solves[0].title, "Team Solve Test");
    assert.equal(profile.body.team.solves[0].points, 100);
    assert.equal(profile.body.team.solves[0].bonus, 25);
    assert.equal(profile.body.team.solves[0].solvedBy, "Bilal Ahmed");
  });

  test("the leaderboard stands the team under its own name", async () => {
    const { status, body } = await req("GET", "/api/leaderboard", undefined, ayesha());
    assert.equal(status, 200);
    assert.equal(body.leaderboard.length, 1);
    assert.equal(body.leaderboard[0].name, "Byte Force");
    assert.equal(body.leaderboard[0].points, 125);
    assert.equal(body.leaderboard[0].solves, 1);
  });

  test("the guess cap is shared by the whole team", async () => {
    const created = await req(
      "POST",
      "/api/challenges",
      {
        title: "Team Rate Limit",
        category: "crypto",
        difficulty: "hard",
        points: 400,
        description: "Guess the flag.",
        flag: "flag{team_guess_budget}",
      },
      adminToken
    );
    assert.equal(created.status, 201);
    const id = created.body.challenge.id;

    // Five wrong guesses from one member use up the team's budget…
    for (let i = 0; i < 5; i++) {
      const attempt = await req(
        "POST",
        `/api/challenges/${id}/submit`,
        { flag: `flag{wrong_guess_${i}}` },
        bilal()
      );
      assert.equal(attempt.status, 200);
      assert.equal(attempt.body.correct, false);
    }
    // …so a teammate's next guess hits the same cooldown.
    const teammate = await req(
      "POST",
      `/api/challenges/${id}/submit`,
      { flag: "flag{wrong_guess_5}" },
      sara()
    );
    assert.equal(teammate.status, 429);
  });
});

describe("leaving and disbanding", () => {
  test("when the captain leaves, the longest-standing member takes over", async () => {
    const left = await req("POST", "/api/teams/leave", {}, bilal());
    assert.equal(left.status, 200);
    assert.equal(left.body.team.memberCount, 3);
    // Ayesha joined first, so the captaincy passes to her.
    assert.equal(left.body.team.captainId, ids["ayesha@example.com"]);
    const bilalMe = await me(bilal());
    assert.equal(bilalMe.teamId, null);
  });

  test("the last member leaving disbands the team", async () => {
    const ayeshaLeft = await req("POST", "/api/teams/leave", {}, ayesha());
    assert.equal(ayeshaLeft.body.team.captainId, ids["sara@example.com"]);
    const saraLeft = await req("POST", "/api/teams/leave", {}, sara());
    assert.equal(saraLeft.body.team.captainId, ids["omar@example.com"]);
    const omarLeft = await req("POST", "/api/teams/leave", {}, omar());
    assert.equal(omarLeft.body.team, null);
    assert.match(omarLeft.body.message, /disbanded/);

    const gone = await req("GET", `/api/teams/${teamAId}`, undefined, adminToken);
    assert.equal(gone.status, 404);
    const omarTeam = await req("GET", "/api/teams/me", undefined, omar());
    assert.equal(omarTeam.status, 404);
  });

  test("only the captain or an admin disbands a team", async () => {
    const created = await req("POST", "/api/teams", { name: "Short Lived" }, zainab());
    assert.equal(created.status, 201);
    const id = created.body.team.id;
    const joined = await req(
      "POST",
      "/api/teams/join",
      { inviteCode: created.body.team.inviteCode },
      ayesha()
    );
    assert.equal(joined.status, 200);

    const byMember = await req("DELETE", `/api/teams/${id}`, undefined, ayesha());
    assert.equal(byMember.status, 403);

    const byAdmin = await req("DELETE", `/api/teams/${id}`, undefined, adminToken);
    assert.equal(byAdmin.status, 200);
    const gone = await req("GET", `/api/teams/${id}`, undefined, adminToken);
    assert.equal(gone.status, 404);
    const zainabMe = await me(zainab());
    assert.equal(zainabMe.teamId, null);
  });

  test("the captain disbands their own team", async () => {
    const disbanded = await req("DELETE", `/api/teams/${teamBId}`, undefined, hassan());
    assert.equal(disbanded.status, 200);
    const hassanMe = await me(hassan());
    assert.equal(hassanMe.teamId, null);
  });
});
