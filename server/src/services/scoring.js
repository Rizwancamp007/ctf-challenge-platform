// Dynamic scoring: a challenge is worth its full base points to the
// first solver, then falls towards a floor as more solvers crack it, so
// early solves are worth more. The first solver also earns a first-blood
// bonus on top. A solve is always worth what the challenge was worth at
// the time, so later scoring changes never rewrite history.

export const FIRST_BLOOD_BONUS = 25;
// Solves needed to halve the value above the floor.
export const SCORE_DECAY = 5;

// The floor a challenge can fall to: a quarter of its base points,
// never less than 10.
export function minPointsFor(basePoints) {
  return Math.max(10, Math.round(basePoints * 0.25));
}

// What a challenge is worth right now, given how many solvers have
// already cracked it. Never below the floor.
export function challengeValue({ basePoints, solveCount }) {
  const floor = minPointsFor(basePoints);
  if (solveCount <= 0) return basePoints;
  const value = floor + (basePoints - floor) / (1 + solveCount / SCORE_DECAY);
  return Math.max(floor, Math.round(value));
}

// What one solve is worth: the challenge's current value, plus the
// first-blood bonus when nobody has solved it yet.
export function pointsForSolve({ basePoints, solveCount }) {
  const firstBlood = solveCount === 0;
  return {
    value: challengeValue({ basePoints, solveCount }),
    firstBlood,
    bonus: firstBlood ? FIRST_BLOOD_BONUS : 0,
  };
}

// Rank solvers by total points, ties broken by who reached that total
// first — the earliest last solve wins.
export function rankStandings(entries) {
  const ranked = [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aTime = new Date(a.lastSolveAt).getTime();
    const bTime = new Date(b.lastSolveAt).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return String(a.solverId).localeCompare(String(b.solverId));
  });
  return ranked.map((entry, i) => ({ ...entry, rank: i + 1 }));
}
