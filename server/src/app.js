import cors from "cors";
import express from "express";
import { createAuthRouter } from "./routes/auth.js";
import { createChallengesRouter } from "./routes/challenges.js";
import { createContainersRouter } from "./routes/containers.js";
import { createHintsRouter } from "./routes/hints.js";
import { createLeaderboardRouter } from "./routes/leaderboard.js";
import { createTeamsRouter } from "./routes/teams.js";
import { createLiveFeed } from "./services/live.js";
import { createMemoryChallengeStore } from "./store/challenges.js";
import { createMemoryHintStore, createMemoryUnlockStore } from "./store/hints.js";
import { createMemorySolveStore } from "./store/solves.js";
import { createMemoryTeamStore } from "./store/teams.js";
import { createMemoryStore } from "./store/users.js";

export function createApp({
  store,
  challengeStore,
  solveStore,
  teamStore,
  hintStore,
  unlockStore,
  live,
} = {}) {
  const users = store || createMemoryStore();
  const challenges = challengeStore || createMemoryChallengeStore();
  const solves = solveStore || createMemorySolveStore();
  const teams = teamStore || createMemoryTeamStore();
  const hints = hintStore || createMemoryHintStore();
  const unlocks = unlockStore || createMemoryUnlockStore();
  const liveFeed = live || createLiveFeed();
  const app = express();
  app.locals.liveFeed = liveFeed;
  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", (req, res) => {
    res.json({ message: "CTF Challenge Platform API" });
  });

  app.use("/api/auth", createAuthRouter(users));
  app.use(
    "/api/challenges",
    createChallengesRouter({
      challenges,
      solves,
      teamStore: teams,
      store: users,
      live: liveFeed,
      hints,
      unlocks,
    })
  );
  app.use(
    "/api/challenges/:challengeId/hints",
    createHintsRouter({
      hints,
      unlocks,
      challenges,
      solves,
      teamStore: teams,
    })
  );
  app.use("/api/containers", createContainersRouter({ challenges }));
  app.use("/api/teams", createTeamsRouter({ teams, users, solves, challenges }));
  app.use(
    "/api/leaderboard",
    createLeaderboardRouter({
      solves,
      store: users,
      teamStore: teams,
      challengeStore: challenges,
      hintStore: unlocks,
      live: liveFeed,
    })
  );

  // Unknown paths still answer JSON, so the client never gets an HTML
  // error page it can't show.
  app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  app.use((err, req, res, next) => {
    // A body that isn't valid JSON comes from express.json() as a
    // SyntaxError — that's a bad request, not a server crash, so say so.
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({
        message: "That request wasn't valid — please try again",
      });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ message: "That request was too large" });
    }
    console.error(err);
    res.status(500).json({ message: "Something went wrong — please try again" });
  });

  return app;
}
