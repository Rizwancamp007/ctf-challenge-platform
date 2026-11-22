import { randomUUID } from "node:crypto";

// Hints are shown in admin order, then by creation — an admin lists
// them in the order a player should meet them.
function sortHints(hints) {
  return [...hints].sort(
    (a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt)
  );
}

export function createMemoryHintStore() {
  const byId = new Map();
  return {
    async create(data) {
      const now = new Date();
      const hint = {
        id: randomUUID(),
        challengeId: String(data.challengeId),
        text: data.text,
        cost: data.cost,
        order: data.order || 0,
        createdAt: now,
        updatedAt: now,
      };
      byId.set(hint.id, hint);
      return hint;
    },
    async listForChallenge(challengeId) {
      return sortHints(
        [...byId.values()].filter((h) => String(h.challengeId) === String(challengeId))
      );
    },
    async findById(id) {
      return byId.get(String(id)) || null;
    },
    async update(id, patch) {
      const hint = byId.get(String(id));
      if (!hint) return null;
      Object.assign(hint, patch, { updatedAt: new Date() });
      return hint;
    },
    async remove(id) {
      return byId.delete(String(id));
    },
    async removeForChallenge(challengeId) {
      for (const [id, hint] of byId) {
        if (String(hint.challengeId) === String(challengeId)) byId.delete(id);
      }
    },
  };
}

export function createMongooseHintStore(Hint) {
  return {
    async create(data) {
      const hint = await Hint.create({
        challenge: data.challengeId,
        text: data.text,
        cost: data.cost,
        order: data.order || 0,
      });
      return { ...hint.toObject(), id: String(hint._id), challengeId: String(hint.challenge) };
    },
    async listForChallenge(challengeId) {
      const hints = await Hint.find({ challenge: challengeId })
        .sort({ order: 1, createdAt: 1 })
        .lean();
      return hints.map((h) => ({
        ...h,
        id: String(h._id),
        challengeId: String(h.challenge),
      }));
    },
    async findById(id) {
      const hint = await Hint.findById(id).lean();
      if (!hint) return null;
      return { ...hint, id: String(hint._id), challengeId: String(hint.challenge) };
    },
    async update(id, patch) {
      const hint = await Hint.findByIdAndUpdate(id, patch, {
        new: true,
        runValidators: true,
      }).lean();
      if (!hint) return null;
      return { ...hint, id: String(hint._id), challengeId: String(hint.challenge) };
    },
    async remove(id) {
      const result = await Hint.deleteOne({ _id: id });
      return result.deletedCount > 0;
    },
    async removeForChallenge(challengeId) {
      await Hint.deleteMany({ challenge: challengeId });
    },
  };
}

// Unlocks are scoped like solves: a team shares one unlock, a player
// without a team unlocks alone.
export function createMemoryUnlockStore() {
  const unlocks = [];
  return {
    async recordUnlock({ challengeId, hintId, userId, teamId, cost }) {
      const existing = unlocks.find((u) => {
        if (String(u.hintId) !== String(hintId)) return false;
        if (teamId) return String(u.teamId || "") === String(teamId);
        return String(u.userId) === String(userId) && !u.teamId;
      });
      if (existing) return existing;
      const unlock = {
        id: randomUUID(),
        challengeId: String(challengeId),
        hintId: String(hintId),
        userId: String(userId),
        teamId: teamId || null,
        cost,
        createdAt: new Date(),
      };
      unlocks.push(unlock);
      return unlock;
    },
    async findUnlock(hintId, userId, teamId) {
      return (
        unlocks.find((u) => {
          if (String(u.hintId) !== String(hintId)) return false;
          if (teamId) return String(u.teamId || "") === String(teamId);
          return String(u.userId) === String(userId) && !u.teamId;
        }) || null
      );
    },
    async listUnlocks() {
      return [...unlocks];
    },
    async listUnlocksForSolver(solverId) {
      return unlocks.filter(
        (u) => String(u.teamId || u.userId) === String(solverId)
      );
    },
    async removeForHint(hintId) {
      for (let i = unlocks.length - 1; i >= 0; i--) {
        if (String(unlocks[i].hintId) === String(hintId)) unlocks.splice(i, 1);
      }
    },
    async removeForChallenge(challengeId) {
      for (let i = unlocks.length - 1; i >= 0; i--) {
        if (String(unlocks[i].challengeId) === String(challengeId)) {
          unlocks.splice(i, 1);
        }
      }
    },
  };
}

export function createMongooseUnlockStore(HintUnlock) {
  return {
    async recordUnlock({ challengeId, hintId, userId, teamId, cost }) {
      const existing = teamId
        ? await HintUnlock.findOne({ hint: hintId, teamId }).lean()
        : await HintUnlock.findOne({ hint: hintId, user: userId, teamId: null }).lean();
      if (existing) {
        return {
          ...existing,
          id: String(existing._id),
          challengeId: String(existing.challenge),
          hintId: String(existing.hint),
          userId: String(existing.user),
        };
      }
      const unlock = await HintUnlock.create({
        challenge: challengeId,
        hint: hintId,
        user: userId,
        teamId: teamId || null,
        cost,
      });
      const row = unlock.toObject();
      return {
        ...row,
        id: String(row._id),
        challengeId: String(row.challenge),
        hintId: String(row.hint),
        userId: String(row.user),
      };
    },
    async findUnlock(hintId, userId, teamId) {
      const row = teamId
        ? await HintUnlock.findOne({ hint: hintId, teamId }).lean()
        : await HintUnlock.findOne({ hint: hintId, user: userId, teamId: null }).lean();
      if (!row) return null;
      return {
        ...row,
        id: String(row._id),
        challengeId: String(row.challenge),
        hintId: String(row.hint),
        userId: String(row.user),
      };
    },
    async listUnlocks() {
      const rows = await HintUnlock.find({}).sort({ createdAt: 1 }).lean();
      return rows.map((r) => ({
        ...r,
        id: String(r._id),
        challengeId: String(r.challenge),
        hintId: String(r.hint),
        userId: String(r.user),
      }));
    },
    async listUnlocksForSolver(solverId) {
      const rows = await HintUnlock.find({
        $or: [{ teamId: String(solverId) }, { user: solverId, teamId: null }],
      })
        .sort({ createdAt: 1 })
        .lean();
      return rows.map((r) => ({
        ...r,
        id: String(r._id),
        challengeId: String(r.challenge),
        hintId: String(r.hint),
        userId: String(r.user),
      }));
    },
    async removeForHint(hintId) {
      await HintUnlock.deleteMany({ hint: hintId });
    },
    async removeForChallenge(challengeId) {
      await HintUnlock.deleteMany({ challenge: challengeId });
    },
  };
}
