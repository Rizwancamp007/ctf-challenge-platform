import { useEffect, useState } from "react";
import { listChallenges } from "../api.js";

export const CATEGORY_LABELS = {
  crypto: "Crypto",
  web: "Web",
  reverse: "Reverse engineering",
  misc: "Misc",
};

const CATEGORY_FILTERS = ["all", "crypto", "web", "reverse", "misc"];
const DIFFICULTY_FILTERS = ["all", "easy", "medium", "hard"];

export default function ChallengeList({ token, onSelect }) {
  const [challenges, setChallenges] = useState([]);
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = {};
    if (category !== "all") params.category = category;
    if (difficulty !== "all") params.difficulty = difficulty;
    listChallenges(token, params)
      .then((list) => {
        if (!cancelled) setChallenges(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load challenges");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, category, difficulty]);

  return (
    <section>
      <h2>Challenges</h2>
      <div className="filters" role="group" aria-label="Filter by category">
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? "filter active" : "filter"}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="filters" role="group" aria-label="Filter by difficulty">
        {DIFFICULTY_FILTERS.map((d) => (
          <button
            key={d}
            type="button"
            className={difficulty === d ? "filter active" : "filter"}
            aria-pressed={difficulty === d}
            onClick={() => setDifficulty(d)}
          >
            {d === "all" ? "Any difficulty" : d[0].toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      {loading && <p className="muted">Loading challenges…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && challenges.length === 0 && (
        <p className="muted">No challenges here yet — check back soon.</p>
      )}
      <ul className="challenge-list">
        {challenges.map((challenge) => (
          <li key={challenge.id} className="challenge-card">
            <button type="button" className="challenge-open" onClick={() => onSelect(challenge.id)}>
              <span className="challenge-title">{challenge.title}</span>
              <span className="challenge-meta">
                <span className={`badge badge-${challenge.difficulty}`}>
                  {challenge.difficulty}
                </span>
                <span className="badge badge-category">
                  {CATEGORY_LABELS[challenge.category] || challenge.category}
                </span>
                <span className="points">{challenge.points} pts</span>
                {challenge.solved && <span className="solved-mark">Solved ✓</span>}
              </span>
              <span className="challenge-solves muted">
                {challenge.solveCount === 1
                  ? "1 solve"
                  : `${challenge.solveCount} solves`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
