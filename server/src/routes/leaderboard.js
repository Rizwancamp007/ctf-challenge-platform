import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { computeStandings } from "../services/scoreboard.js";

// Ranked standings, recomputed from the solve records on every read.
// A team stands under its own name; a player without a team stands alone.
export function createLeaderboardRouter({ solves, store, teamStore }) {
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
        if (teamStore) {
          const team = await teamStore.findById(entry.solverId);
          if (team) name = team.name;
        }
        if (name === "Player" && entry.solverId) {
          const user = await store.findById(entry.solverId);
          if (user) name = user.name;
          else name = "Disbanded team";
        }
        out.push({ ...entry, name });
      }
      return res.json({ leaderboard: out });
    })
  );

  return router;
}
