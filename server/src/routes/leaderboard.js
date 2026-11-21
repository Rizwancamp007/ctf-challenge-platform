import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { describeStandings } from "../services/scoreboard.js";

// Ranked standings, recomputed from the solve records on every read.
// A team stands under its own name; a player without a team stands alone.
// While the board is frozen, players see the standings as they were when
// the freeze went on, while admins still see the live board.
export function createLeaderboardRouter({
  solves,
  store,
  teamStore,
  challengeStore,
  live,
}) {
  const router = express.Router();

  async function standings() {
    const all = await solves.listSolves();
    return describeStandings(all, { teamStore, userStore: store, challengeStore });
  }

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const frozen = live.isFrozen();
      if (frozen && req.user.role !== "admin") {
        return res.json({
          leaderboard: live.getSnapshot(),
          frozen: true,
          frozenAt: live.getFrozenAt(),
        });
      }
      return res.json({
        leaderboard: await standings(),
        frozen,
        frozenAt: frozen ? live.getFrozenAt() : null,
      });
    })
  );

  // The live feed: solves, first bloods, position changes and freezes,
  // newest last. The scoreboard page loads this once, then listens on
  // the socket for the rest.
  router.get(
    "/feed",
    requireAuth,
    asyncHandler(async (req, res) => {
      return res.json({ events: live.recent(50) });
    })
  );

  // Freeze the public board: the standings players see stop moving while
  // the event keeps running. Unfreezing shows the live board again.
  router.post(
    "/freeze",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const board = await standings();
      live.freeze(board);
      return res.json({ frozen: true, frozenAt: live.getFrozenAt(), leaderboard: board });
    })
  );

  router.post(
    "/unfreeze",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      live.unfreeze();
      return res.json({ frozen: false, leaderboard: await standings() });
    })
  );

  // One solver's detail: rank, points, where the points came from, and
  // the solves in order — the timeline behind a row on the board.
  router.get(
    "/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await standings();
      const entry = board.find((e) => String(e.solverId) === String(req.params.id));
      if (!entry) {
        return res.status(404).json({ message: "Nobody on the board by that name" });
      }
      const all = await solves.listSolves();
      const mine = all
        .filter(
          (s) => String(s.teamId || s.userId || s.user) === String(req.params.id)
        )
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const timeline = [];
      for (const solve of mine) {
        const challengeId = String(solve.challengeId || solve.challenge || "");
        const challenge = challengeStore
          ? await challengeStore.findById(challengeId)
          : null;
        timeline.push({
          challengeId,
          title: challenge ? challenge.title : "Challenge",
          category: challenge ? challenge.category : "misc",
          points: solve.points,
          bonus: solve.bonus || 0,
          firstBlood: !!solve.firstBlood,
          solvedBy: solve.userId || solve.user,
          createdAt: solve.createdAt,
        });
      }
      // The solver name on a timeline row, where the store knows it.
      for (const row of timeline) {
        const user = store ? await store.findById(String(row.solvedBy)) : null;
        row.solvedBy = user ? user.name : "Player";
      }
      return res.json({ ...entry, timeline });
    })
  );

  return router;
}
