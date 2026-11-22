import { rankStandings } from "./scoring.js";

// Totals are recomputed from the solve records on every read, so they
// can never drift from what was actually solved. A solver is a team
// once teams exist, otherwise the player solving alone. Hint costs come
// off the total — a hint is paid for out of the points already earned.
export function computeStandings(solves, deductions = new Map()) {
  const bySolver = new Map();
  for (const solve of solves) {
    const solverId = String(solve.teamId || solve.userId || solve.user);
    const points = (solve.points || 0) + (solve.bonus || 0);
    const entry = bySolver.get(solverId) || {
      solverId,
      points: 0,
      solves: 0,
      firstBloods: 0,
      hintCosts: 0,
      lastSolveAt: solve.createdAt,
    };
    entry.points += points;
    entry.solves += 1;
    if (solve.firstBlood) entry.firstBloods += 1;
    if (new Date(solve.createdAt) > new Date(entry.lastSolveAt)) {
      entry.lastSolveAt = solve.createdAt;
    }
    bySolver.set(solverId, entry);
  }
  for (const [solverId, cost] of deductions) {
    const entry = bySolver.get(String(solverId));
    if (entry) {
      entry.hintCosts += cost;
      entry.points -= cost;
    }
  }
  return rankStandings([...bySolver.values()]);
}

// Total hint spend per solver, from the unlock records.
export function computeHintCosts(unlocks) {
  const bySolver = new Map();
  for (const unlock of unlocks || []) {
    const solverId = String(unlock.teamId || unlock.userId || unlock.user);
    bySolver.set(solverId, (bySolver.get(solverId) || 0) + (unlock.cost || 0));
  }
  return bySolver;
}

// Points and solves per category, per solver — so the board can show
// where each team's points came from. Challenge rows come from the
// store (memory rows carry challengeId, database rows carry challenge).
export function computeBreakdown(solves, challengeById) {
  const bySolver = new Map();
  for (const solve of solves) {
    const solverId = String(solve.teamId || solve.userId || solve.user);
    const challengeId = String(solve.challengeId || solve.challenge || "");
    const category = challengeById.get(challengeId)?.category || "misc";
    const entry = bySolver.get(solverId) || {};
    const bucket = entry[category] || { points: 0, solves: 0 };
    bucket.points += (solve.points || 0) + (solve.bonus || 0);
    bucket.solves += 1;
    entry[category] = bucket;
    bySolver.set(solverId, entry);
  }
  return bySolver;
}

// Ranked standings with a display name and a category breakdown on every
// row. A solver stands under its team name when it has one, otherwise
// under the player's own name; a team that has been disbanded keeps its
// solves under its old name.
export async function describeStandings(
  solves,
  { teamStore, userStore, challengeStore, hintStore } = {}
) {
  let deductions = new Map();
  if (hintStore) {
    deductions = computeHintCosts(await hintStore.listUnlocks());
  }
  const standings = computeStandings(solves, deductions);
  let challengeById = new Map();
  if (challengeStore) {
    const all = await challengeStore.list({ includeHidden: true });
    challengeById = new Map(
      all.map((c) => [String(c.id ?? c._id), c])
    );
  }
  const breakdowns = computeBreakdown(solves, challengeById);
  const out = [];
  for (const entry of standings) {
    let name = "Player";
    if (teamStore) {
      const team = await teamStore.findById(entry.solverId);
      if (team) name = team.name;
    }
    if (name === "Player" && entry.solverId) {
      const user = userStore ? await userStore.findById(entry.solverId) : null;
      if (user) name = user.name;
      else name = "Disbanded team";
    }
    out.push({
      ...entry,
      name,
      breakdown: breakdowns.get(entry.solverId) || {},
    });
  }
  return out;
}

// Which solvers moved, comparing the ranks before a solve with the ranks
// after it. A solver that wasn't on the board before counts as entering
// it. The result drives the live "position changed" feed.
export function rankMoves(before, after) {
  const beforeRank = new Map(before.map((e) => [e.solverId, e.rank]));
  const moves = [];
  for (const entry of after) {
    const from = beforeRank.has(entry.solverId)
      ? beforeRank.get(entry.solverId)
      : null;
    if (from !== entry.rank) {
      moves.push({
        solverId: entry.solverId,
        name: entry.name,
        from,
        to: entry.rank,
        points: entry.points,
      });
    }
  }
  return moves;
}
