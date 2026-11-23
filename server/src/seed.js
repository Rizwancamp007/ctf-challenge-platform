import dotenv from "dotenv";
import mongoose from "mongoose";
import { Challenge } from "./models/Challenge.js";
import { Hint } from "./models/Hint.js";
import { Team } from "./models/Team.js";
import { User } from "./models/User.js";
import { hashPassword } from "./services/auth.js";
import { hashFlag } from "./services/flags.js";
import { createMongooseChallengeStore } from "./store/challenges.js";
import { createMongooseHintStore } from "./store/hints.js";
import { createMongooseTeamStore } from "./store/teams.js";
import { createMongooseStore } from "./store/users.js";

dotenv.config();

// Demo accounts are created from environment variables only. Set them in
// your local .env or in deployment config before running this script, for
// example: npm run seed. No demo credentials live in this file.
const demoEnv = (name) => process.env[`DEMO_${name}`];

const DEMO_ACCOUNTS = [
  {
    role: "admin",
    email: demoEnv("ADMIN_EMAIL"),
    password: demoEnv("ADMIN_PASSWORD"),
  },
  {
    role: "player",
    email: demoEnv("PLAYER_EMAIL"),
    password: demoEnv("PLAYER_PASSWORD"),
  },
];

// One demo challenge per category. Each flag comes from its own env var —
// set DEMO_FLAG_CRYPTO, DEMO_FLAG_WEB, DEMO_FLAG_REVERSE and
// DEMO_FLAG_MISC before running the seed. A challenge whose flag is
// missing is skipped, so a half-filled env still seeds what it can.
const DEMO_CHALLENGES = [
  {
    title: "Caesar's Secret",
    category: "crypto",
    difficulty: "easy",
    points: 100,
    description:
      "A note was found with every letter shifted by the same amount. Work out the shift and read what it says.",
    flag: process.env.DEMO_FLAG_CRYPTO,
    hints: [{ text: "The shift is the same for every letter — try all 25.", cost: 10 }],
  },
  {
    title: "Hidden in Plain Sight",
    category: "web",
    difficulty: "easy",
    points: 100,
    description:
      "The flag is a file on this site, and the site tells search engines exactly where not to look.",
    flag: process.env.DEMO_FLAG_WEB,
    container: { url: "http://localhost:8081" },
    hints: [{ text: "Check robots.txt — it points at a folder crawlers should skip.", cost: 10 }],
  },
  {
    title: "Read the Bytes",
    category: "reverse",
    difficulty: "medium",
    points: 200,
    description:
      "A small program prints the flag one byte at a time, but only after a check. Read how it decides what to print.",
    flag: process.env.DEMO_FLAG_REVERSE,
    hints: [],
  },
  {
    title: "First Steps",
    category: "misc",
    difficulty: "easy",
    points: 50,
    description:
      "A gentle first flag: look closely at this challenge's own description — the answer is hiding in it.",
    flag: process.env.DEMO_FLAG_MISC,
    hints: [{ text: "Read the first word of every sentence.", cost: 5 }],
  },
];

// Two demo teams, so the leaderboard has something to show before real
// teams sign up. The demo player captains one, the demo admin the other.
const DEMO_TEAMS = [
  { name: "Demo Team", captainRole: "player" },
  { name: "Demo Squad", captainRole: "admin" },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set, cannot seed.");
    process.exit(1);
  }
  const ready = DEMO_ACCOUNTS.filter((a) => a.email && a.password);
  const missing = DEMO_ACCOUNTS.filter((a) => !a.email || !a.password).map((a) => a.role);
  if (missing.length) {
    console.log(`Skipping ${missing.join(", ")} demo account(s): set the DEMO_* env vars first.`);
  }
  if (!ready.length) {
    console.error("No complete demo accounts found in env vars, nothing seeded.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const store = createMongooseStore(User);
  const challengeStore = createMongooseChallengeStore(Challenge);
  const hintStore = createMongooseHintStore(Hint);
  const teamStore = createMongooseTeamStore(Team);

  const accounts = {};
  for (const account of ready) {
    const existing = await store.findByEmail(account.email);
    if (existing) {
      console.log(`Demo ${account.role} already exists, skipped: ${account.email}`);
      accounts[account.role] = existing;
      continue;
    }
    const created = await store.create({
      name: `Demo ${account.role}`,
      email: account.email,
      passwordHash: await hashPassword(account.password),
      role: account.role,
    });
    console.log(`Demo ${account.role} created: ${account.email}`);
    accounts[account.role] = created;
  }

  for (const demo of DEMO_CHALLENGES) {
    if (!demo.flag) {
      console.log(`Skipping demo challenge "${demo.title}": set its DEMO_FLAG_* env var first.`);
      continue;
    }
    const existing = await challengeStore.list({ category: demo.category });
    if (existing.some((c) => c.title === demo.title)) {
      console.log(`Demo challenge already exists, skipped: ${demo.title}`);
      continue;
    }
    const challenge = await challengeStore.create({
      title: demo.title,
      category: demo.category,
      difficulty: demo.difficulty,
      points: demo.points,
      description: demo.description,
      files: [],
      container: demo.container,
      flagHash: hashFlag(demo.flag),
      visible: true,
    });
    console.log(`Demo challenge created: ${demo.title} (${demo.category})`);
    for (const hint of demo.hints) {
      await hintStore.create({
        challengeId: challenge._id || challenge.id,
        text: hint.text,
        cost: hint.cost,
        order: 0,
      });
    }
  }

  for (const demo of DEMO_TEAMS) {
    const captain = accounts[demo.captainRole];
    if (!captain) {
      console.log(`Skipping demo team "${demo.name}": its captain account was not seeded.`);
      continue;
    }
    const existing = await teamStore.findByMember(captain._id || captain.id);
    if (existing) {
      console.log(`Demo team already exists for ${demo.captainRole}, skipped: ${existing.name}`);
      continue;
    }
    const team = await teamStore.create({
      name: demo.name,
      captainId: captain._id || captain.id,
    });
    console.log(`Demo team created: ${team.name} (invite code ${team.inviteCode})`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // Already down.
  }
  process.exit(1);
});
