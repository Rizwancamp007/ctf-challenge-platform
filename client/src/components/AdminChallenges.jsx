import { useEffect, useState } from "react";
import {
  createChallenge,
  deleteChallenge,
  fetchContainerStatus,
  listChallenges,
  updateChallenge,
} from "../api.js";
import AdminHints from "./AdminHints.jsx";
import { CATEGORY_LABELS } from "./ChallengeList.jsx";

const EMPTY_FORM = {
  title: "",
  category: "crypto",
  difficulty: "easy",
  points: 100,
  description: "",
  files: [{ name: "", url: "" }],
  containerImage: "",
  containerPort: "",
  containerUrl: "",
  flag: "",
  visible: true,
};

function toForm(challenge) {
  return {
    title: challenge.title,
    category: challenge.category,
    difficulty: challenge.difficulty,
    points: challenge.points,
    description: challenge.description || "",
    files:
      challenge.files && challenge.files.length > 0
        ? challenge.files.map((f) => ({ name: f.name, url: f.url }))
        : [{ name: "", url: "" }],
    containerImage: challenge.container?.image || "",
    containerPort: challenge.container?.port ? String(challenge.container.port) : "",
    containerUrl: challenge.container?.url || "",
    flag: "",
    visible: challenge.visible !== false,
  };
}

function toPayload(form) {
  const payload = {
    title: form.title,
    category: form.category,
    difficulty: form.difficulty,
    points: Number(form.points),
    description: form.description,
    files: form.files.filter((f) => f.name.trim() && f.url.trim()),
    visible: form.visible,
  };
  if (form.containerImage.trim() || form.containerPort || form.containerUrl.trim()) {
    payload.container = {};
    if (form.containerImage.trim()) payload.container.image = form.containerImage.trim();
    if (form.containerPort) payload.container.port = Number(form.containerPort);
    if (form.containerUrl.trim()) payload.container.url = form.containerUrl.trim();
  }
  if (form.flag.trim()) payload.flag = form.flag.trim();
  return payload;
}

export default function AdminChallenges({ token }) {
  const [challenges, setChallenges] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [openHintsId, setOpenHintsId] = useState(null);
  const [containers, setContainers] = useState([]);
  const [containersLoading, setContainersLoading] = useState(false);
  const [containersError, setContainersError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      setChallenges(await listChallenges(token));
    } catch (err) {
      setError(err.message || "Could not load challenges");
    } finally {
      setLoading(false);
    }
  }

  async function refreshContainers() {
    setContainersLoading(true);
    setContainersError("");
    try {
      setContainers(await fetchContainerStatus(token));
    } catch (err) {
      setContainersError(err.message || "Could not check containers");
    } finally {
      setContainersLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    refreshContainers();
  }, [token]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setFile(index, field, value) {
    setForm((f) => ({
      ...f,
      files: f.files.map((file, i) => (i === index ? { ...file, [field]: value } : file)),
    }));
  }

  function startEdit(challenge) {
    setEditingId(challenge.id);
    setForm(toForm(challenge));
    setError("");
    setNotice("");
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      if (editingId) {
        const saved = await updateChallenge(editingId, toPayload(form), token);
        setChallenges((list) => list.map((c) => (c.id === editingId ? { ...saved, solved: c.solved, solveCount: c.solveCount } : c)));
        setNotice(`"${saved.title}" updated.`);
      } else {
        const saved = await createChallenge(toPayload(form), token);
        setChallenges((list) => [...list, { ...saved, solved: false, solveCount: 0 }]);
        setNotice(`"${saved.title}" created.`);
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || "Could not save the challenge");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await deleteChallenge(id, token);
      setChallenges((list) => list.filter((c) => c.id !== id));
      setNotice("Challenge deleted.");
    } catch (err) {
      setError(err.message || "Could not delete the challenge");
    }
  }

  return (
    <section>
      <h2>Manage challenges</h2>
      {notice && <p className="success">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSave}>
        <h3>{editingId ? "Edit challenge" : "New challenge"}</h3>
        <div>
          <label htmlFor="admin-title">Title</label>
          <input
            id="admin-title"
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <div>
            <label htmlFor="admin-category">Category</label>
            <select
              id="admin-category"
              value={form.category}
              onChange={(e) => setField("category", e.target.value)}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-difficulty">Difficulty</label>
            <select
              id="admin-difficulty"
              value={form.difficulty}
              onChange={(e) => setField("difficulty", e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label htmlFor="admin-points">Points</label>
            <input
              id="admin-points"
              type="number"
              min="10"
              max="1000"
              value={form.points}
              onChange={(e) => setField("points", e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="admin-description">Description</label>
          <textarea
            id="admin-description"
            rows="4"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </div>
        <div>
          <label>Files</label>
          {form.files.map((file, i) => (
            <div key={i} className="form-row">
              <input
                placeholder="File name"
                value={file.name}
                onChange={(e) => setFile(i, "name", e.target.value)}
                aria-label={`File ${i + 1} name`}
              />
              <input
                placeholder="File URL"
                value={file.url}
                onChange={(e) => setFile(i, "url", e.target.value)}
                aria-label={`File ${i + 1} URL`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, files: [...f.files, { name: "", url: "" }] }))}
          >
            Add another file
          </button>
        </div>
        <div>
          <label>Challenge container (optional)</label>
          <div className="form-row">
            <input
              placeholder="Image, e.g. ctf/web-one"
              value={form.containerImage}
              onChange={(e) => setField("containerImage", e.target.value)}
              aria-label="Container image"
            />
            <input
              placeholder="Port"
              type="number"
              min="1"
              max="65535"
              value={form.containerPort}
              onChange={(e) => setField("containerPort", e.target.value)}
              aria-label="Container port"
            />
            <input
              placeholder="Service URL"
              value={form.containerUrl}
              onChange={(e) => setField("containerUrl", e.target.value)}
              aria-label="Container URL"
            />
          </div>
        </div>
        <div>
          <label htmlFor="admin-flag">Flag {editingId && "(leave blank to keep the current one)"}</label>
          <input
            id="admin-flag"
            type="password"
            value={form.flag}
            onChange={(e) => setField("flag", e.target.value)}
            placeholder="flag{...}"
            autoComplete="off"
            required={!editingId}
          />
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={form.visible}
              onChange={(e) => setField("visible", e.target.checked)}
            />{" "}
            Visible to players
          </label>
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : editingId ? "Save changes" : "Create challenge"}
        </button>{" "}
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>
      {loading && <p className="muted">Loading challenges…</p>}
      <h3>Challenge containers</h3>
      {containersError && <p className="error">{containersError}</p>}
      {containersLoading && <p className="muted">Checking containers…</p>}
      <ul className="admin-list">
        {containers.map((container) => (
          <li key={container.challengeId} className="admin-row">
            <div>
              <strong>{container.title}</strong>{" "}
              {container.url ? (
                <span className="muted">{container.url} · </span>
              ) : (
                <span className="muted">No service set · </span>
              )}
              <span
                className={
                  container.status === "up"
                    ? "success"
                    : container.status === "down"
                      ? "error"
                      : "muted"
                }
              >
                {container.status === "up"
                  ? "Up"
                  : container.status === "down"
                    ? "Down"
                    : "Not configured"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {containers.length === 0 && !containersLoading && (
        <p className="muted">No challenges yet.</p>
      )}
      <button type="button" onClick={refreshContainers} disabled={containersLoading}>
        {containersLoading ? "Checking…" : "Refresh container status"}
      </button>
      <ul className="admin-list">
        {challenges.map((challenge) => (
          <li key={challenge.id} className="admin-row">
            <div>
              <strong>{challenge.title}</strong>{" "}
              <span className={`badge badge-${challenge.difficulty}`}>{challenge.difficulty}</span>{" "}
              <span className="muted">
                {CATEGORY_LABELS[challenge.category]} · {challenge.points} pts ·{" "}
                {challenge.solveCount} solves
                {challenge.visible === false ? " · hidden" : ""}
              </span>
            </div>
            <div>
              <button
                type="button"
                onClick={() =>
                  setOpenHintsId((id) => (id === challenge.id ? null : challenge.id))
                }
              >
                {openHintsId === challenge.id ? "Hide hints" : "Hints"}
              </button>{" "}
              <button type="button" onClick={() => startEdit(challenge)}>
                Edit
              </button>{" "}
              <button type="button" onClick={() => handleDelete(challenge.id)}>
                {confirmDeleteId === challenge.id ? "Click again to confirm" : "Delete"}
              </button>
            </div>
            {openHintsId === challenge.id && (
              <AdminHints token={token} challengeId={challenge.id} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
