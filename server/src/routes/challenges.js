import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { CATEGORIES, DIFFICULTIES } from "../models/Challenge.js";
import { hashFlag, verifyFlag } from "../services/flags.js";
import { createGuessLimiter } from "../services/guessLimiter.js";
import {
  describeStandings,
  rankMoves,
} from "../services/scoreboard.js";
import { challengeValue, pointsForSolve } from "../services/scoring.js";
import { publicChallenge } from "../store/challenges.js";

// Checks one challenge payload and returns either the clean fields or a
// list of problems. On update every field is optional; on create the flag
// is required — it is hashed immediately and never stored as given.
function validateChallengeInput(body, { flagRequired }) {
  const errors = [];
  const data = {};

  if (body.title !== undefined || flagRequired) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) errors.push("Title is required");
    else if (title.length > 200) errors.push("Title is too long");
    else data.title = title;
  }
  if (body.category !== undefined || flagRequired) {
    if (!CATEGORIES.includes(body.category)) {
      errors.push(`Category must be one of: ${CATEGORIES.join(", ")}`);
    } else data.category = body.category;
  }
  if (body.difficulty !== undefined || flagRequired) {
    if (!DIFFICULTIES.includes(body.difficulty)) {
      errors.push(`Difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
    } else data.difficulty = body.difficulty;
  }
  if (body.points !== undefined || flagRequired) {
    const points = Number(body.points);
    if (!Number.isInteger(points) || points < 10 || points > 1000) {
      errors.push("Points must be a whole number between 10 and 1000");
    } else data.points = points;
  }
  if (body.description !== undefined) {
    const description = typeof body.description === "string" ? body.description : "";
    if (description.length > 5000) errors.push("Description is too long");
    else data.description = description;
  }
  if (body.files !== undefined) {
    if (!Array.isArray(body.files)) {
      errors.push("Files must be a list");
    } else {
      const files = [];
      for (const file of body.files) {
        const name = typeof file?.name === "string" ? file.name.trim() : "";
        const url = typeof file?.url === "string" ? file.url.trim() : "";
        if (!name || !url) {
          errors.push("Each file needs a name and a URL");
          break;
        }
        // Files are links to hosted downloads, not uploads — only plain
        // web links are accepted, nothing that could run code in a browser.
        if (!/^https?:\/\//i.test(url)) {
          errors.push("File URLs must start with http:// or https://");
          break;
        }
        files.push({ name, url });
      }
      if (!errors.length) data.files = files;
    }
  }
  if (body.container !== undefined) {
    if (body.container === null) {
      data.container = undefined;
    } else if (typeof body.container !== "object" || Array.isArray(body.container)) {
      errors.push("Container must be an object");
    } else {
      const container = {};
      if (body.container.image !== undefined) {
        container.image = String(body.container.image).trim();
      }
      if (body.container.port !== undefined) {
        const port = Number(body.container.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          errors.push("Container port must be between 1 and 65535");
        } else container.port = port;
      }
      if (body.container.url !== undefined) {
        container.url = String(body.container.url).trim();
      }
      if (!errors.length) data.container = container;
    }
  }
  if (body.visible !== undefined) {
    if (typeof body.visible !== "boolean") errors.push("Visible must be true or false");
    else data.visible = body.visible;
  }

  let flagHash;
  if (body.flag !== undefined || flagRequired) {
    const flag = typeof body.flag === "string" ? body.flag.trim() : "";
    if (!flag) {
      if (flagRequired) errors.push("A flag is required");
    } else if (flag.length > 200) {
      errors.push("Flag is too long");
    } else {
      flagHash = hashFlag(flag);
    }
  }

  return { data, flagHash, errors };
}

export function createChallengesRouter({
  challenges,
  solves,
  teamStore,
  limiter,
  store,
  live,
  hints,
  unlocks,
} = {}) {
  const router = express.Router();
  const guessLimiter = limiter || createGuessLimiter();

  // The team a player belongs to, if any — the team record is the source
  // of truth, not the login token, so joining a team takes effect at once.
  async function teamIdFor(userId) {
    if (!teamStore) return null;
    const team = await teamStore.findByMember(userId);
    return team ? String(team.id ?? team._id) : null;
  }

  async function withSolveInfo(req, challenge) {
    const pub = publicChallenge(challenge);
    const teamId = await teamIdFor(req.user.id);
    const solve = await solves.findSolve(pub.id, req.user.id, teamId);
    const solveCount = await solves.countSolves(pub.id);
    pub.solved = !!solve;
    pub.solveCount = solveCount;
    // What the challenge is worth right now — the value falls as more
    // solvers crack it, so the list always shows the live price.
    pub.currentPoints = challengeValue({
      basePoints: challenge.points,
      solveCount,
    });
    pub.firstBloodAvailable = solveCount === 0;
    return pub;
  }

  // Players see the visible challenges, admins see the hidden ones too.
  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { category, difficulty } = req.query;
      if (category && !CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Unknown category" });
      }
      if (difficulty && !DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({ message: "Unknown difficulty" });
      }
      const list = await challenges.list({
        category: category || undefined,
        difficulty: difficulty || undefined,
        includeHidden: req.user.role === "admin",
      });
      const out = [];
      for (const challenge of list) {
        out.push(await withSolveInfo(req, challenge));
      }
      return res.json({ challenges: out });
    })
  );

  router.get(
    "/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const challenge = await challenges.findById(req.params.id);
      if (!challenge || (challenge.visible === false && req.user.role !== "admin")) {
        return res.status(404).json({ message: "Challenge not found" });
      }
      return res.json({ challenge: await withSolveInfo(req, challenge) });
    })
  );

  router.post(
    "/",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { data, flagHash, errors } = validateChallengeInput(req.body || {}, {
        flagRequired: true,
      });
      if (errors.length) {
        return res.status(400).json({ message: errors[0], errors });
      }
      const challenge = await challenges.create({ ...data, flagHash });
      return res.status(201).json({ challenge: publicChallenge(challenge) });
    })
  );

  router.put(
    "/:id",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { data, flagHash, errors } = validateChallengeInput(req.body || {}, {
        flagRequired: false,
      });
      if (errors.length) {
        return res.status(400).json({ message: errors[0], errors });
      }
      const patch = { ...data };
      if (flagHash) patch.flagHash = flagHash;
      const challenge = await challenges.update(req.params.id, patch);
      if (!challenge) return res.status(404).json({ message: "Challenge not found" });
      return res.json({ challenge: publicChallenge(challenge) });
    })
  );

  router.delete(
    "/:id",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const challenge = await challenges.findById(req.params.id);
      if (!challenge) return res.status(404).json({ message: "Challenge not found" });
      await solves.removeForChallenge(req.params.id);
      if (unlocks) await unlocks.removeForChallenge(req.params.id);
      if (hints) await hints.removeForChallenge(req.params.id);
      await challenges.remove(req.params.id);
      return res.json({ message: "Challenge deleted" });
    })
  );

  // Submit a flag. The flag is compared against the stored hash in
  // constant time, guesses are capped per solver, and a challenge can
  // only be solved once — a second correct guess just says so. A solve
  // is worth the challenge's current value, which falls as more solvers
  // crack it, plus a first-blood bonus for the very first solve.
  router.post(
    "/:id/submit",
    requireAuth,
    asyncHandler(async (req, res) => {
      const challenge = await challenges.findById(req.params.id);
      if (!challenge || (challenge.visible === false && req.user.role !== "admin")) {
        return res.status(404).json({ message: "Challenge not found" });
      }
      const flag = typeof req.body?.flag === "string" ? req.body.flag.trim() : "";
      if (!flag) {
        return res.status(400).json({ message: "Enter a flag to submit" });
      }
      const challengeId = String(challenge.id ?? challenge._id);
      // Guesses are capped per team — a team shares one guess budget, so
      // one player can't burn through it for everyone, and nobody can
      // dodge the cap by switching accounts on the same team.
      const teamId = await teamIdFor(req.user.id);
      const scope = teamId || req.user.id;
      const correct = verifyFlag(flag, challenge.flagHash);
      const existing = await solves.findSolve(challengeId, req.user.id, teamId);
      if (correct && existing) {
        return res.json({
          correct: true,
          alreadySolved: true,
          message: "Already solved — nice work",
        });
      }
      const limit = guessLimiter.check(`${scope}:${challengeId}`);
      if (!limit.allowed) {
        return res.status(429).json({
          message: "Too many guesses — wait a minute and try again",
          retryAfterSeconds: Math.ceil(limit.retryAfterMs / 1000),
        });
      }
      await solves.recordSubmission({ challengeId, userId: req.user.id, correct });
      if (!correct) {
        guessLimiter.recordWrong(`${scope}:${challengeId}`);
        return res.json({
          correct: false,
          message: "That's not the flag — keep digging",
          remainingGuesses: limit.remaining,
        });
      }
      guessLimiter.recordCorrect(`${scope}:${challengeId}`);
      const solveCount = await solves.countSolves(challengeId);
      const award = pointsForSolve({ basePoints: challenge.points, solveCount });
      // The board before this solve, so the live feed can say who moved.
      const describe = (list) =>
        describeStandings(list, {
          teamStore,
          userStore: store,
          challengeStore: challenges,
          hintStore: unlocks,
        });
      const before = live ? await describe(await solves.listSolves()) : null;
      const solve = await solves.recordSolve({
        challengeId,
        userId: req.user.id,
        teamId: teamId || null,
        points: award.value,
        firstBlood: award.firstBlood,
        bonus: award.bonus,
      });
      if (live) {
        let solverName = "Player";
        if (teamId && teamStore) {
          const team = await teamStore.findById(teamId);
          if (team) solverName = team.name;
        }
        if (solverName === "Player" && store) {
          const user = await store.findById(req.user.id);
          if (user) solverName = user.name;
        }
        live.record({
          type: "solve",
          solverId: teamId || req.user.id,
          solverName,
          challengeId,
          challengeTitle: challenge.title,
          category: challenge.category,
          points: solve.points,
          bonus: solve.bonus,
          firstBlood: solve.firstBlood,
          createdAt: solve.createdAt,
        });
        const after = await describe(await solves.listSolves());
        const moves = rankMoves(before, after);
        if (moves.length) {
          live.record({
            type: "leaderboard",
            moves,
            standings: after.map((e) => ({
              rank: e.rank,
              solverId: e.solverId,
              name: e.name,
              points: e.points,
            })),
          });
        }
      }
      return res.json({
        correct: true,
        solved: true,
        points: solve.points,
        firstBlood: solve.firstBlood,
        bonus: solve.bonus,
        message: solve.firstBlood
          ? "Correct — first blood! Nice work"
          : "Correct — nice work",
      });
    })
  );

  return router;
}
