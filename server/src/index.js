import dotenv from "dotenv";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { Challenge } from "./models/Challenge.js";
import { Solve } from "./models/Solve.js";
import { Submission } from "./models/Submission.js";
import { User } from "./models/User.js";
import { createMemoryChallengeStore, createMongooseChallengeStore } from "./store/challenges.js";
import { createMemorySolveStore, createMongooseSolveStore } from "./store/solves.js";
import { createMemoryStore, createMongooseStore } from "./store/users.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

async function main() {
  let store = createMemoryStore();
  let challengeStore = createMemoryChallengeStore();
  let solveStore = createMemorySolveStore();
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    store = createMongooseStore(User);
    challengeStore = createMongooseChallengeStore(Challenge);
    solveStore = createMongooseSolveStore(Solve, Submission);
    console.log("Connected to MongoDB");
  } else {
    console.log("No MONGODB_URI set, using in-memory data (resets on restart)");
  }
  const app = createApp({ store, challengeStore, solveStore });
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
