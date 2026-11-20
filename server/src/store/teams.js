import { randomUUID } from "node:crypto";
import { generateInviteCode } from "../services/teams.js";

// The invite code is the join key, so it only goes out to team members
// and admins — a public team listing never carries it.
export function publicTeam(team) {
  if (!team) return null;
  return {
    id: String(team.id ?? team._id),
    name: team.name,
    inviteCode: team.inviteCode,
    captainId: String(team.captainId ?? team.captain),
    memberIds: (team.members || []).map((m) => String(m?.id ?? m?._id ?? m)),
    memberCount: (team.members || []).length,
    createdAt: team.createdAt,
  };
}

function toPlain(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name,
    inviteCode: doc.inviteCode,
    captainId: String(doc.captain),
    members: (doc.members || []).map((m) => String(m)),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Local runs without a database keep teams in memory (resets on restart).
export function createMemoryTeamStore() {
  const byId = new Map();
  const byCode = new Map();
  return {
    async create({ name, captainId }) {
      let inviteCode = generateInviteCode();
      while (byCode.has(inviteCode)) inviteCode = generateInviteCode();
      const now = new Date();
      const team = {
        id: randomUUID(),
        name,
        inviteCode,
        captainId: String(captainId),
        members: [String(captainId)],
        createdAt: now,
        updatedAt: now,
      };
      byId.set(team.id, team);
      byCode.set(inviteCode, team);
      return team;
    },
    async findById(id) {
      return byId.get(String(id)) || null;
    },
    async findByInviteCode(code) {
      return byCode.get(String(code).toUpperCase()) || null;
    },
    async findByMember(userId) {
      const id = String(userId);
      for (const team of byId.values()) {
        if (team.members.includes(id)) return team;
      }
      return null;
    },
    async list() {
      return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
    },
    async update(id, patch) {
      const team = byId.get(String(id));
      if (!team) return null;
      if (patch.inviteCode && patch.inviteCode !== team.inviteCode) {
        byCode.delete(team.inviteCode);
        byCode.set(patch.inviteCode, team);
      }
      Object.assign(team, patch, { updatedAt: new Date() });
      return team;
    },
    async remove(id) {
      const team = byId.get(String(id));
      if (!team) return false;
      byId.delete(String(id));
      byCode.delete(team.inviteCode);
      return true;
    },
  };
}

export function createMongooseTeamStore(Team) {
  return {
    async create({ name, captainId }) {
      let inviteCode = generateInviteCode();
      while (await Team.findOne({ inviteCode }).lean()) {
        inviteCode = generateInviteCode();
      }
      const team = await Team.create({
        name,
        inviteCode,
        captain: captainId,
        members: [captainId],
      });
      return toPlain(team.toObject());
    },
    async findById(id) {
      const team = await Team.findById(id).lean();
      return toPlain(team);
    },
    async findByInviteCode(code) {
      const team = await Team.findOne({ inviteCode: String(code).toUpperCase() }).lean();
      return toPlain(team);
    },
    async findByMember(userId) {
      const team = await Team.findOne({ members: userId }).lean();
      return toPlain(team);
    },
    async list() {
      const teams = await Team.find({}).sort({ createdAt: 1 }).lean();
      return teams.map(toPlain);
    },
    async update(id, patch) {
      const mongoPatch = { ...patch };
      if (mongoPatch.captainId !== undefined) {
        mongoPatch.captain = mongoPatch.captainId;
        delete mongoPatch.captainId;
      }
      const team = await Team.findByIdAndUpdate(id, mongoPatch, {
        new: true,
        runValidators: true,
      }).lean();
      return toPlain(team);
    },
    async remove(id) {
      const result = await Team.deleteOne({ _id: id });
      return result.deletedCount > 0;
    },
  };
}
