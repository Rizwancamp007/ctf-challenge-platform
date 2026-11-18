import { randomUUID } from "node:crypto";

// The flag hash never leaves the server — list and detail views strip it
// before anything is sent to a client.
export function publicChallenge(challenge) {
  if (!challenge) return null;
  const { flagHash, _id, ...rest } = challenge;
  return { ...rest, id: String(challenge.id ?? _id) };
}

export function createMemoryChallengeStore() {
  const byId = new Map();
  return {
    async create(data) {
      const now = new Date();
      const challenge = {
        id: randomUUID(),
        ...data,
        files: data.files || [],
        visible: data.visible !== false,
        createdAt: now,
        updatedAt: now,
      };
      byId.set(challenge.id, challenge);
      return challenge;
    },
    async list({ category, difficulty, includeHidden } = {}) {
      return [...byId.values()]
        .filter(
          (c) =>
            (!category || c.category === category) &&
            (!difficulty || c.difficulty === difficulty) &&
            (includeHidden || c.visible !== false)
        )
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async findById(id) {
      return byId.get(String(id)) || null;
    },
    async update(id, patch) {
      const challenge = byId.get(String(id));
      if (!challenge) return null;
      Object.assign(challenge, patch, { updatedAt: new Date() });
      return challenge;
    },
    async remove(id) {
      return byId.delete(String(id));
    },
  };
}

export function createMongooseChallengeStore(Challenge) {
  return {
    async create(data) {
      const challenge = await Challenge.create(data);
      return challenge.toObject();
    },
    async list({ category, difficulty, includeHidden } = {}) {
      const filter = {};
      if (category) filter.category = category;
      if (difficulty) filter.difficulty = difficulty;
      if (!includeHidden) filter.visible = true;
      return Challenge.find(filter).sort({ createdAt: 1 }).lean();
    },
    async findById(id) {
      const challenge = await Challenge.findById(id).lean();
      return challenge || null;
    },
    async update(id, patch) {
      const challenge = await Challenge.findByIdAndUpdate(id, patch, {
        new: true,
        runValidators: true,
      }).lean();
      return challenge || null;
    },
    async remove(id) {
      const result = await Challenge.deleteOne({ _id: id });
      return result.deletedCount > 0;
    },
  };
}
