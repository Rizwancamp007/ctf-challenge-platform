import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { MAX_TEAM_SIZE, generateInviteCode } from "../services/teams.js";
import { publicTeam } from "../store/teams.js";
import { publicUser } from "../store/users.js";

// A player belongs to at most one team. The team record is the source of
// truth for membership; the user's teamId is kept in step with it so the
// client can tell at a glance whether someone is on a team.
export function createTeamsRouter({ teams, users, solves, challenges }) {
  const router = express.Router();

  async function findMyTeam(userId) {
    return teams.findByMember(userId);
  }

  async function setUserTeam(userId, teamId) {
    await users.update(userId, { teamId: teamId || null });
  }

  // The team profile: members with their names, the team's solves with
  // challenge titles, and the score — recomputed from the solve records
  // like the leaderboard does, so it can never drift.
  async function teamProfile(team, { includeInviteCode }) {
    const members = [];
    const namesById = new Map();
    for (const memberId of team.members || []) {
      const user = await users.findById(memberId);
      if (!user) continue;
      members.push(publicUser(user));
      namesById.set(String(user.id ?? user._id), user.name);
    }
    const allSolves = await solves.listSolves();
    const teamSolves = allSolves
      .filter((s) => String(s.teamId || "") === String(team.id ?? team._id))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    let score = 0;
    const solvesOut = [];
    for (const solve of teamSolves) {
      score += (solve.points || 0) + (solve.bonus || 0);
      const challengeId = String(solve.challengeId ?? solve.challenge);
      const challenge = await challenges.findById(challengeId);
      const solverId = String(solve.userId ?? solve.user ?? "");
      solvesOut.push({
        challengeId,
        title: challenge ? challenge.title : "Deleted challenge",
        points: solve.points,
        bonus: solve.bonus || 0,
        firstBlood: !!solve.firstBlood,
        solvedBy: namesById.get(solverId) || "Teammate",
        solvedAt: solve.createdAt,
      });
    }
    const out = {
      ...publicTeam(team),
      members,
      solves: solvesOut,
      score,
      solveCount: solvesOut.length,
    };
    if (!includeInviteCode) delete out.inviteCode;
    return out;
  }

  async function disband(team) {
    for (const memberId of team.members || []) {
      await setUserTeam(memberId, null);
    }
    await teams.remove(team.id ?? team._id);
  }

  function isCaptain(team, userId) {
    return String(team.captainId ?? team.captain) === String(userId);
  }

  function isMember(team, userId) {
    return (team.members || []).map(String).includes(String(userId));
  }

  // Create a team. The creator becomes captain and first member.
  router.post(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(400).json({ message: "Give your team a name" });
      if (name.length > 60) {
        return res.status(400).json({ message: "Team name is too long" });
      }
      const existing = await findMyTeam(req.user.id);
      if (existing) {
        return res.status(409).json({ message: "You're already on a team" });
      }
      const team = await teams.create({ name, captainId: req.user.id });
      await setUserTeam(req.user.id, team.id ?? team._id);
      return res.status(201).json({
        team: await teamProfile(team, { includeInviteCode: true }),
      });
    })
  );

  // Admins see every team.
  router.get(
    "/",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const list = await teams.list();
      return res.json({ teams: list.map((t) => publicTeam(t)) });
    })
  );

  router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await findMyTeam(req.user.id);
      if (!team) return res.status(404).json({ message: "You're not on a team yet" });
      return res.json({ team: await teamProfile(team, { includeInviteCode: true }) });
    })
  );

  router.get(
    "/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await teams.findById(req.params.id);
      if (!team) return res.status(404).json({ message: "Team not found" });
      const includeInviteCode =
        req.user.role === "admin" || isMember(team, req.user.id);
      return res.json({ team: await teamProfile(team, { includeInviteCode }) });
    })
  );

  // Join with an invite code. A player can only be on one team, and a
  // team holds at most four players.
  router.post(
    "/join",
    requireAuth,
    asyncHandler(async (req, res) => {
      const code =
        typeof req.body?.inviteCode === "string"
          ? req.body.inviteCode.trim().toUpperCase()
          : "";
      if (!code) return res.status(400).json({ message: "Enter an invite code" });
      const team = await teams.findByInviteCode(code);
      if (!team) {
        return res.status(404).json({ message: "No team uses that invite code" });
      }
      const existing = await findMyTeam(req.user.id);
      if (existing) {
        return res.status(409).json({ message: "You're already on a team" });
      }
      if ((team.members || []).length >= MAX_TEAM_SIZE) {
        return res
          .status(409)
          .json({ message: `That team is full (${MAX_TEAM_SIZE} players)` });
      }
      const members = [...(team.members || []).map(String), String(req.user.id)];
      const updated = await teams.update(team.id ?? team._id, { members });
      await setUserTeam(req.user.id, team.id ?? team._id);
      return res.json({ team: await teamProfile(updated, { includeInviteCode: true }) });
    })
  );

  // Leave. If the captain leaves and others remain, the longest-standing
  // member takes over. If the last member leaves, the team is gone.
  router.post(
    "/leave",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await findMyTeam(req.user.id);
      if (!team) return res.status(404).json({ message: "You're not on a team" });
      const members = (team.members || []).map(String).filter((m) => m !== String(req.user.id));
      await setUserTeam(req.user.id, null);
      if (members.length === 0) {
        await teams.remove(team.id ?? team._id);
        return res.json({ team: null, message: "You left — the team is disbanded" });
      }
      const patch = { members };
      if (isCaptain(team, req.user.id)) patch.captainId = members[0];
      const updated = await teams.update(team.id ?? team._id, patch);
      return res.json({ team: await teamProfile(updated, { includeInviteCode: true }) });
    })
  );

  // The captain removes a member. The captain leaves instead of kicking
  // themselves — leaving hands the captaincy over.
  router.post(
    "/:id/kick",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await teams.findById(req.params.id);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (!isCaptain(team, req.user.id)) {
        return res.status(403).json({ message: "Only the captain manages the roster" });
      }
      const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
      if (!userId) return res.status(400).json({ message: "Pick a member to remove" });
      if (String(userId) === String(req.user.id)) {
        return res
          .status(400)
          .json({ message: "Captains leave the team instead of removing themselves" });
      }
      if (!isMember(team, userId)) {
        return res.status(400).json({ message: "That player isn't on this team" });
      }
      const members = (team.members || []).map(String).filter((m) => m !== String(userId));
      const updated = await teams.update(team.id ?? team._id, { members });
      await setUserTeam(userId, null);
      return res.json({ team: await teamProfile(updated, { includeInviteCode: true }) });
    })
  );

  // The captain hands the captaincy to another member.
  router.post(
    "/:id/transfer",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await teams.findById(req.params.id);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (!isCaptain(team, req.user.id)) {
        return res.status(403).json({ message: "Only the captain hands over the team" });
      }
      const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
      if (!userId) return res.status(400).json({ message: "Pick a member to make captain" });
      if (String(userId) === String(req.user.id)) {
        return res.status(400).json({ message: "You're already the captain" });
      }
      if (!isMember(team, userId)) {
        return res.status(400).json({ message: "That player isn't on this team" });
      }
      const updated = await teams.update(team.id ?? team._id, { captainId: String(userId) });
      return res.json({ team: await teamProfile(updated, { includeInviteCode: true }) });
    })
  );

  // The captain gets a fresh invite code — the old one stops working.
  router.post(
    "/:id/regenerate-code",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await teams.findById(req.params.id);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (!isCaptain(team, req.user.id)) {
        return res.status(403).json({ message: "Only the captain changes the invite code" });
      }
      let code = generateInviteCode();
      while (await teams.findByInviteCode(code)) code = generateInviteCode();
      const updated = await teams.update(team.id ?? team._id, { inviteCode: code });
      return res.json({ team: await teamProfile(updated, { includeInviteCode: true }) });
    })
  );

  // Disband a team. The captain or an admin can do it; the team's solves
  // stay in the records as history.
  router.delete(
    "/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const team = await teams.findById(req.params.id);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (req.user.role !== "admin" && !isCaptain(team, req.user.id)) {
        return res.status(403).json({ message: "Only the captain disbands the team" });
      }
      await disband(team);
      return res.json({ message: "Team disbanded" });
    })
  );

  return router;
}
