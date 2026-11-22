import { useEffect, useState } from "react";
import { createHint, deleteHint, listHints, updateHint } from "../api.js";

// Hint management for one challenge, shown inside the admin challenge
// list. Hints cost points when a team unlocks them, so each one has a
// price next to its text.
export default function AdminHints({ token, challengeId }) {
  const [hints, setHints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [cost, setCost] = useState(20);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listHints(challengeId, token)
      .then((data) => {
        if (!cancelled) setHints(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load hints");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, challengeId]);

  function startEdit(hint) {
    setEditingId(hint.id);
    setText(hint.text || "");
    setCost(hint.cost);
    setError("");
    setNotice("");
  }

  function cancelEdit() {
    setEditingId(null);
    setText("");
    setCost(20);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      if (editingId) {
        const saved = await updateHint(challengeId, editingId, { text, cost: Number(cost) }, token);
        setHints((list) => list.map((h) => (h.id === editingId ? saved : h)));
        setNotice("Hint updated.");
      } else {
        const saved = await createHint(challengeId, { text, cost: Number(cost) }, token);
        setHints((list) => [...list, saved]);
        setNotice("Hint added.");
      }
      cancelEdit();
    } catch (err) {
      setError(err.message || "Could not save the hint");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(hintId) {
    if (confirmDeleteId !== hintId) {
      setConfirmDeleteId(hintId);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await deleteHint(challengeId, hintId, token);
      setHints((list) => list.filter((h) => h.id !== hintId));
      setNotice("Hint deleted.");
    } catch (err) {
      setError(err.message || "Could not delete the hint");
    }
  }

  return (
    <div className="hint-manager">
      <h4>Hints</h4>
      {notice && <p className="success">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading hints…</p>}
      <ul className="hint-list">
        {hints.map((hint, i) => (
          <li key={hint.id} className="hint-row">
            <div>
              <strong>Hint {i + 1}</strong>{" "}
              <span className="muted">· {hint.cost} pts</span>
              <p>{hint.text}</p>
            </div>
            <div>
              <button type="button" onClick={() => startEdit(hint)}>
                Edit
              </button>{" "}
              <button type="button" onClick={() => handleDelete(hint.id)}>
                {confirmDeleteId === hint.id ? "Click again to confirm" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {hints.length === 0 && !loading && (
        <p className="muted">No hints yet — add one below.</p>
      )}
      <form onSubmit={handleSave}>
        <div>
          <label htmlFor={`hint-text-${challengeId}`}>
            {editingId ? "Edit hint" : "New hint"}
          </label>
          <textarea
            id={`hint-text-${challengeId}`}
            rows="2"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <div>
            <label htmlFor={`hint-cost-${challengeId}`}>Cost (points)</label>
            <input
              id={`hint-cost-${challengeId}`}
              type="number"
              min="0"
              max="500"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : editingId ? "Save hint" : "Add hint"}
        </button>{" "}
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
