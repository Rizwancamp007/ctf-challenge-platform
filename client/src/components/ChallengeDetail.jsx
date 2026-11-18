import { useEffect, useState } from "react";
import { getChallenge, submitFlag } from "../api.js";
import { CATEGORY_LABELS } from "./ChallengeList.jsx";

export default function ChallengeDetail({ token, challengeId, onBack }) {
  const [challenge, setChallenge] = useState(null);
  const [flag, setFlag] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    setFlag("");
    getChallenge(challengeId, token)
      .then((data) => {
        if (!cancelled) setChallenge(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load this challenge");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, challengeId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!flag.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const data = await submitFlag(challengeId, flag, token);
      setResult(data);
      if (data.solved) {
        setChallenge((c) => (c ? { ...c, solved: true, solveCount: c.solveCount + 1 } : c));
      }
    } catch (err) {
      setResult({ correct: false, message: err.message || "Something went wrong — please try again" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section>
        <p className="muted">Loading challenge…</p>
      </section>
    );
  }

  if (error || !challenge) {
    return (
      <section>
        <p className="error">{error || "Challenge not found"}</p>
        <button type="button" onClick={onBack}>
          Back to challenges
        </button>
      </section>
    );
  }

  return (
    <section>
      <button type="button" className="link-button" onClick={onBack}>
        ← Back to challenges
      </button>
      <h2>{challenge.title}</h2>
      <p>
        <span className={`badge badge-${challenge.difficulty}`}>{challenge.difficulty}</span>{" "}
        <span className="badge badge-category">
          {CATEGORY_LABELS[challenge.category] || challenge.category}
        </span>{" "}
        <span className="points">{challenge.points} pts</span>{" "}
        <span className="muted">
          {challenge.solveCount === 1 ? "1 solve" : `${challenge.solveCount} solves`}
        </span>
      </p>
      {challenge.solved && <p className="solved-banner">Solved ✓ — nice work</p>}
      {challenge.description && <p>{challenge.description}</p>}
      {challenge.files && challenge.files.length > 0 && (
        <div>
          <h3>Files</h3>
          <ul>
            {challenge.files.map((file) => (
              <li key={file.name}>
                <a href={file.url} target="_blank" rel="noreferrer">
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {challenge.container && challenge.container.url && (
        <p>
          Challenge service:{" "}
          <a href={challenge.container.url} target="_blank" rel="noreferrer">
            {challenge.container.url}
          </a>
        </p>
      )}
      {!challenge.solved && (
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="flag">Flag</label>
            <input
              id="flag"
              value={flag}
              onChange={(e) => setFlag(e.target.value)}
              placeholder="flag{...}"
              autoComplete="off"
              disabled={submitting}
            />
          </div>
          {result && (
            <p className={result.correct ? "success" : "error"}>{result.message}</p>
          )}
          {result && !result.correct && typeof result.remainingGuesses === "number" && (
            <p className="muted">{result.remainingGuesses} guesses left before a short wait</p>
          )}
          <button type="submit" disabled={submitting || !flag.trim()}>
            {submitting ? "Checking…" : "Submit flag"}
          </button>
        </form>
      )}
      {challenge.solved && result && result.correct && (
        <p className="success">{result.message}</p>
      )}
    </section>
  );
}
