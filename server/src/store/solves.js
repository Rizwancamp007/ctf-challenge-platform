import { randomUUID } from "node:crypto";

export function createMemorySolveStore() {
  const solves = [];
  const submissions = [];
  return {
    // A second solve for the same challenge and user is a no-op — the
    // first one stands, so a challenge can only ever count once.
    async recordSolve({ challengeId, userId, teamId, points }) {
      const existing = solves.find(
        (s) =>
          String(s.challengeId) === String(challengeId) &&
          String(s.userId) === String(userId)
      );
      if (existing) return existing;
      const solve = {
        id: randomUUID(),
        challengeId: String(challengeId),
        userId: String(userId),
        teamId: teamId || null,
        points,
        createdAt: new Date(),
      };
      solves.push(solve);
      return solve;
    },
    async findSolve(challengeId, userId) {
      return (
        solves.find(
          (s) =>
            String(s.challengeId) === String(challengeId) &&
            String(s.userId) === String(userId)
        ) || null
      );
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
    async recordSolve({ challengeId, userId, teamId, points }) {
      const existing = await Solve.findOne({ challenge: challengeId, user: userId }).lean();
      if (existing) return existing;
      const solve = await Solve.create({
        challenge: challengeId,
        user: userId,
        teamId: teamId || null,
        points,
      });
      return solve.toObject();
    },
    async findSolve(challengeId, userId) {
      const solve = await Solve.findOne({ challenge: challengeId, user: userId }).lean();
      return solve || null;
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
