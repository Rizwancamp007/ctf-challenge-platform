import { rankStandings } from "./scoring.js";

// Totals are recomputed from the solve records on every read, so they
// can never drift from what was actually solved. A solver is a team
// once teams exist, otherwise the player solving alone.
export function computeStandings(solves) {
  const bySolver = new Map();
  for (const solve of solves) {
    const solverId = String(solve.teamId || solve.userId || solve.user);
    const points = (solve.points || 0) + (solve.bonus || 0);
    const entry = bySolver.get(solverId) || {
      solverId,
      points: 0,
      solves: 0,
      firstBloods: 0,
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
  return rankStandings([...bySolver.values()]);
}
