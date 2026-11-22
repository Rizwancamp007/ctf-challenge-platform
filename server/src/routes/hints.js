import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { computeHintCosts, computeStandings } from "../services/scoreboard.js";

// A hint costs points, paid out of what the team has already earned, so
// a hint is a trade: a nudge now against a few places on the board.
// Unlocks are per team — one teammate unlocking it unlocks it for the
// whole team, and nobody pays twice for the same hint.
export function createHintsRouter({
  hints,
  unlocks,
  challenges,
  solves,
  teamStore,
} = {}) {
  const router = express.Router({ mergeParams: true });

  function validateHintInput(body, { textRequired }) {
    const errors = [];
    const data = {};
    if (body.text !== undefined || textRequired) {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) errors.push("Hint text is required");
      else if (text.length > 2000) errors.push("Hint text is too long");
      else data.text = text;
    }
    if (body.cost !== undefined || textRequired) {
      const cost = Number(body.cost);
      if (!Number.isInteger(cost) || cost < 0 || cost > 500) {
        errors.push("Hint cost must be a whole number between 0 and 500");
      } else data.cost = cost;
    }
    if (body.order !== undefined) {
      const order = Number(body.order);
      if (!Number.isInteger(order) || order < 0) {
        errors.push("Hint order must be a whole number of 0 or more");
      } else data.order = order;
    }
    return { data, errors };
  }

  async function loadChallenge(req, res) {
    const challenge = await challenges.findById(req.params.challengeId);
    if (!challenge || (challenge.visible === false && req.user.role !== "admin")) {
      res.status(404).json({ message: "Challenge not found" });
      return null;
    }
    return challenge;
  }

  async function teamIdFor(userId) {
    if (!teamStore) return null;
    const team = await teamStore.findByMember(userId);
    return team ? String(team.id ?? team._id) : null;
  }

  // The team's score right now: solve points, less what it has already
  // spent on hints. A hint can only be bought with points already won.
  async function currentScore(userId) {
    const teamId = await teamIdFor(userId);
    const solverId = teamId || userId;
    const all = await solves.listSolves();
    const standings = computeStandings(
      all,
      computeHintCosts(await unlocks.listUnlocks())
    );
    const mine = standings.find((e) => String(e.solverId) === String(solverId));
    return { teamId, solverId, score: mine ? mine.points : 0 };
  }

  function publicHint(hint, unlocked, isAdmin) {
    const out = {
      id: String(hint.id ?? hint._id),
      cost: hint.cost,
      order: hint.order || 0,
      unlocked,
    };
    if (unlocked || isAdmin) out.text = hint.text;
    return out;
  }

  // Players see the cost of every hint and the text of the ones their
  // team has unlocked; admins see every hint in full.
  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const challenge = await loadChallenge(req, res);
      if (!challenge) return;
      const list = await hints.listForChallenge(challenge.id ?? challenge._id);
      const out = [];
      for (const hint of list) {
        const teamId = await teamIdFor(req.user.id);
        const unlock = await unlocks.findUnlock(
          hint.id ?? hint._id,
          req.user.id,
          teamId
        );
        out.push(publicHint(hint, !!unlock, req.user.role === "admin"));
      }
      return res.json({ hints: out });
    })
  );

  router.post(
    "/",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const challenge = await loadChallenge(req, res);
      if (!challenge) return;
      const { data, errors } = validateHintInput(req.body || {}, { textRequired: true });
      if (errors.length) {
        return res.status(400).json({ message: errors[0], errors });
      }
      const hint = await hints.create({
        challengeId: String(challenge.id ?? challenge._id),
        ...data,
      });
      return res.status(201).json({ hint: publicHint(hint, true, true) });
    })
  );

  router.put(
    "/:hintId",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const challenge = await loadChallenge(req, res);
      if (!challenge) return;
      const { data, errors } = validateHintInput(req.body || {}, { textRequired: false });
      if (errors.length) {
        return res.status(400).json({ message: errors[0], errors });
      }
      const hint = await hints.findById(req.params.hintId);
      if (!hint || String(hint.challengeId) !== String(challenge.id ?? challenge._id)) {
        return res.status(404).json({ message: "Hint not found" });
      }
      const updated = await hints.update(req.params.hintId, data);
      return res.json({ hint: publicHint(updated, true, true) });
    })
  );

  router.delete(
    "/:hintId",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const challenge = await loadChallenge(req, res);
      if (!challenge) return;
      const hint = await hints.findById(req.params.hintId);
      if (!hint || String(hint.challengeId) !== String(challenge.id ?? challenge._id)) {
        return res.status(404).json({ message: "Hint not found" });
      }
      await unlocks.removeForHint(req.params.hintId);
      await hints.remove(req.params.hintId);
      return res.json({ message: "Hint deleted" });
    })
  );

  // Unlock a hint: charge the cost once, then the text is open to the
  // whole team. Unlocking again just returns the text — no second charge.
  router.post(
    "/:hintId/unlock",
    requireAuth,
    asyncHandler(async (req, res) => {
      const challenge = await loadChallenge(req, res);
      if (!challenge) return;
      const hint = await hints.findById(req.params.hintId);
      if (!hint || String(hint.challengeId) !== String(challenge.id ?? challenge._id)) {
        return res.status(404).json({ message: "Hint not found" });
      }
      const { teamId, solverId, score } = await currentScore(req.user.id);
      const existing = await unlocks.findUnlock(
        hint.id ?? hint._id,
        req.user.id,
        teamId
      );
      if (existing) {
        return res.json({
          hint: publicHint(hint, true, false),
          alreadyUnlocked: true,
          pointsDeducted: 0,
          remainingScore: score,
        });
      }
      if (score < hint.cost) {
        return res.status(402).json({
          message: `Not enough points yet — this hint costs ${hint.cost} and your team has ${score}`,
          needed: hint.cost,
          current: score,
        });
      }
      await unlocks.recordUnlock({
        challengeId: String(challenge.id ?? challenge._id),
        hintId: String(hint.id ?? hint._id),
        userId: req.user.id,
        teamId,
        cost: hint.cost,
      });
      return res.json({
        hint: publicHint(hint, true, false),
        alreadyUnlocked: false,
        pointsDeducted: hint.cost,
        remainingScore: score - hint.cost,
        solverId,
      });
    })
  );

  return router;
}
