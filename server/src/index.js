import dotenv from "dotenv";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { attachLiveSocket } from "./liveSocket.js";
import { Challenge } from "./models/Challenge.js";
import { Hint } from "./models/Hint.js";
import { HintUnlock } from "./models/HintUnlock.js";
import { Solve } from "./models/Solve.js";
import { Submission } from "./models/Submission.js";
import { Team } from "./models/Team.js";
import { User } from "./models/User.js";
import { createMemoryChallengeStore, createMongooseChallengeStore } from "./store/challenges.js";
import {
  createMemoryHintStore,
  createMemoryUnlockStore,
  createMongooseHintStore,
  createMongooseUnlockStore,
} from "./store/hints.js";
import { createMemorySolveStore, createMongooseSolveStore } from "./store/solves.js";
import { createMemoryTeamStore, createMongooseTeamStore } from "./store/teams.js";
import { createMemoryStore, createMongooseStore } from "./store/users.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

async function main() {
  let store = createMemoryStore();
  let challengeStore = createMemoryChallengeStore();
  let solveStore = createMemorySolveStore();
  let teamStore = createMemoryTeamStore();
  let hintStore = createMemoryHintStore();
  let unlockStore = createMemoryUnlockStore();
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    store = createMongooseStore(User);
    challengeStore = createMongooseChallengeStore(Challenge);
    solveStore = createMongooseSolveStore(Solve, Submission);
    teamStore = createMongooseTeamStore(Team);
    hintStore = createMongooseHintStore(Hint);
    unlockStore = createMongooseUnlockStore(HintUnlock);
    console.log("Connected to MongoDB");
  } else {
    console.log("No MONGODB_URI set, using in-memory data (resets on restart)");
  }
  const app = createApp({ store, challengeStore, solveStore, teamStore, hintStore, unlockStore });
  const httpServer = createServer(app);
  attachLiveSocket(httpServer, app.locals.liveFeed, {
    corsOrigin: process.env.CLIENT_URL || "http://localhost:5173",
  });
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
