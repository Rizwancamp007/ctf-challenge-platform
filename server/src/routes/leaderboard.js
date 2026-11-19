import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { computeStandings } from "../services/scoreboard.js";

// Ranked standings, recomputed from the solve records on every read.
// Teams arrive with the team work — until then each player stands alone.
export function createLeaderboardRouter({ solves, store }) {
  const router = express.Router();

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const all = await solves.listSolves();
      const standings = computeStandings(all);
      const out = [];
      for (const entry of standings) {
        let name = "Player";
        if (entry.solverId) {
          const user = await store.findById(entry.solverId);
          if (user) name = user.name;
        }
        out.push({ ...entry, name });
      }
      return res.json({ leaderboard: out });
    })
  );

  return router;
}
