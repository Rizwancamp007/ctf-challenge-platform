import { randomUUID } from "node:crypto";

export function createMemorySolveStore() {
  const solves = [];
  const submissions = [];
  return {
    // A solve counts once per team, whoever on the team submits the
    // flag. A player without a team solves alone, so the scope is the
    // team when there is one, otherwise the player.
    async recordSolve({ challengeId, userId, teamId, points, firstBlood, bonus }) {
      const existing = solves.find((s) => {
        if (String(s.challengeId) !== String(challengeId)) return false;
        if (teamId) return String(s.teamId || "") === String(teamId);
        return String(s.userId) === String(userId) && !s.teamId;
      });
      if (existing) return existing;
      const solve = {
        id: randomUUID(),
        challengeId: String(challengeId),
        userId: String(userId),
        teamId: teamId || null,
        points,
        firstBlood: !!firstBlood,
        bonus: bonus || 0,
        createdAt: new Date(),
      };
      solves.push(solve);
      return solve;
    },
    async findSolve(challengeId, userId, teamId) {
      return (
        solves.find((s) => {
          if (String(s.challengeId) !== String(challengeId)) return false;
          if (teamId) return String(s.teamId || "") === String(teamId);
          return String(s.userId) === String(userId) && !s.teamId;
        }) || null
      );
    },
    async listSolves() {
      return [...solves];
    },
    async listSolvesForChallenge(challengeId) {
      return solves.filter((s) => String(s.challengeId) === String(challengeId));
    },
    async countSolves(challengeId) {
      return solves.filter((s) => String(s.challengeId) === String(challengeId)).length;
    },
    async recordSubmission({ challengeId, userId, correct }) {
      const submission = {
        id: randomUUID(),
        challengeId: String(challengeId),
        userId: String(userId),
        correct: !!correct,
        createdAt: new Date(),
      };
      submissions.push(submission);
      return submission;
    },
    async removeForChallenge(challengeId) {
      for (let i = solves.length - 1; i >= 0; i--) {
        if (String(solves[i].challengeId) === String(challengeId)) solves.splice(i, 1);
      }
      for (let i = submissions.length - 1; i >= 0; i--) {
        if (String(submissions[i].challengeId) === String(challengeId)) {
          submissions.splice(i, 1);
        }
      }
    },
  };
}

export function createMongooseSolveStore(Solve, Submission) {
  return {
    async recordSolve({ challengeId, userId, teamId, points, firstBlood, bonus }) {
      const existing = teamId
        ? await Solve.findOne({ challenge: challengeId, teamId }).lean()
        : await Solve.findOne({ challenge: challengeId, user: userId, teamId: null }).lean();
      if (existing) return existing;
      const solve = await Solve.create({
        challenge: challengeId,
        user: userId,
        teamId: teamId || null,
        points,
        firstBlood: !!firstBlood,
        bonus: bonus || 0,
      });
      return solve.toObject();
    },
    async findSolve(challengeId, userId, teamId) {
      const solve = teamId
        ? await Solve.findOne({ challenge: challengeId, teamId }).lean()
        : await Solve.findOne({ challenge: challengeId, user: userId, teamId: null }).lean();
      return solve || null;
    },
    async listSolves() {
      return Solve.find({}).sort({ createdAt: 1 }).lean();
    },
    async listSolvesForChallenge(challengeId) {
      return Solve.find({ challenge: challengeId }).sort({ createdAt: 1 }).lean();
    },
    async countSolves(challengeId) {
      return Solve.countDocuments({ challenge: challengeId });
    },
    async recordSubmission({ challengeId, userId, correct }) {
      const submission = await Submission.create({
        challenge: challengeId,
        user: userId,
        correct: !!correct,
      });
      return submission.toObject();
    },
    async removeForChallenge(challengeId) {
      await Solve.deleteMany({ challenge: challengeId });
      await Submission.deleteMany({ challenge: challengeId });
    },
  };
}
