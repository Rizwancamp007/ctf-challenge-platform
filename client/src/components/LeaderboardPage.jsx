import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  fetchLeaderboard,
  fetchLeaderboardEntry,
  fetchLeaderboardFeed,
  freezeLeaderboard,
  unfreezeLeaderboard,
} from "../api.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const CATEGORIES = ["crypto", "web", "reverse", "misc"];

// The live feed: solves, first bloods, position changes and freezes, as
// they happen. The board itself refreshes from the API whenever an event
// lands, and polls every 30 seconds if the live connection drops.
export default function LeaderboardPage({ token, user }) {
  const [board, setBoard] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [frozenAt, setFrozenAt] = useState(null);
  const [feed, setFeed] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchLeaderboard(token);
      setBoard(data.leaderboard || []);
      setFrozen(!!data.frozen);
      setFrozenAt(data.frozenAt || null);
    } catch (err) {
      setError(err.message || "Could not load the leaderboard");
    }
    try {
      const events = await fetchLeaderboardFeed(token);
      setFeed([...events].reverse());
    } catch {
      // The board is the main thing — a missing feed is not fatal.
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      connectedRef.current = true;
      setConnected(true);
    });
    socket.on("disconnect", () => {
      connectedRef.current = false;
      setConnected(false);
    });
    socket.on("feed", (events) => {
      setFeed([...events].reverse());
    });
    socket.on("event", (event) => {
      setFeed((prev) => [event, ...prev].slice(0, 50));
      // A solve, a move or a freeze changes what the board shows.
      load();
    });
    return () => socket.disconnect();
  }, [load]);

  // If the live connection drops, keep the board fresh by polling.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!connectedRef.current) load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function selectSolver(solverId) {
    setError("");
    try {
      const entry = await fetchLeaderboardEntry(solverId, token);
      setSelected(entry);
    } catch (err) {
      setError(err.message || "Could not load that team");
    }
  }

  async function handleFreeze() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = frozen
        ? await unfreezeLeaderboard(token)
        : await freezeLeaderboard(token);
      setFrozen(!!data.frozen);
      setFrozenAt(data.frozenAt || null);
      setBoard(data.leaderboard || board);
      setNotice(
        data.frozen
          ? "Scoreboard frozen — players see the standings as they are now"
          : "Scoreboard is live again"
      );
    } catch (err) {
      setError(err.message || "Something went wrong — please try again");
    } finally {
      setBusy(false);
    }
  }

  function eventText(event) {
    if (event.type === "solve") {
      const points = (event.points || 0) + (event.bonus || 0);
      return `${event.solverName} solved ${event.challengeTitle} (+${points} points)${
        event.firstBlood ? " — first blood!" : ""
      }`;
    }
    if (event.type === "leaderboard") {
      return (event.moves || [])
        .map((move) =>
          move.from
            ? `${move.name} moved #${move.from} → #${move.to}`
            : `${move.name} joined the board at #${move.to}`
        )
        .join("; ");
    }
    if (event.type === "freeze") {
      return event.frozen
        ? "The scoreboard was frozen"
        : "The scoreboard is live again";
    }
    return "";
  }

  return (
    <section>
      <h2>Leaderboard</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {frozen && (
        <p className="frozen-banner">
          Scoreboard frozen
          {frozenAt ? ` — standings as of ${new Date(frozenAt).toLocaleTimeString()}` : ""}
          {user.role === "admin" && " (you see the live board)"}
        </p>
      )}
      {!connected && (
        <p className="muted">Live updates paused — refreshing every 30 seconds.</p>
      )}

      {user.role === "admin" && (
        <p>
          <button type="button" onClick={handleFreeze} disabled={busy}>
            {frozen ? "Unfreeze scoreboard" : "Freeze scoreboard"}
          </button>{" "}
          <span className="muted">
            Freezing holds the public board where it is while the event keeps
            running.
          </span>
        </p>
      )}

      {board.length === 0 ? (
        <p className="muted">No solves yet — the board fills up as teams crack challenges.</p>
      ) : (
        <div className="table-scroll">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Points</th>
                <th>Solves</th>
                <th>First bloods</th>
                <th>By category</th>
              </tr>
            </thead>
            <tbody>
              {board.map((entry) => (
                <tr
                  key={entry.solverId}
                  onClick={() => selectSolver(entry.solverId)}
                  className={
                    selected?.solverId === entry.solverId ? "selected-row" : ""
                  }
                >
                  <td>{entry.rank}</td>
                  <td>{entry.name}</td>
                  <td>{entry.points}</td>
                  <td>{entry.solves}</td>
                  <td>{entry.firstBloods}</td>
                  <td>
                    {CATEGORIES.filter((c) => entry.breakdown?.[c]).map((c) => (
                      <span key={c} className="breakdown-chip">
                        {c} {entry.breakdown[c].points}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Select a row to see that team&apos;s solves.</p>

      {selected && (
        <div>
          <h3>
            {selected.name} — #{selected.rank}, {selected.points} points
          </h3>
          <p className="muted">
            {selected.solves} {selected.solves === 1 ? "solve" : "solves"} ·{" "}
            {selected.firstBloods} first blood
            {selected.firstBloods === 1 ? "" : "s"}
          </p>
          <h4>By category</h4>
          {CATEGORIES.filter((c) => selected.breakdown?.[c]).length === 0 ? (
            <p className="muted">No solves yet.</p>
          ) : (
            <ul>
              {CATEGORIES.filter((c) => selected.breakdown?.[c]).map((c) => (
                <li key={c}>
                  {c} — {selected.breakdown[c].points} points,{" "}
                  {selected.breakdown[c].solves}{" "}
                  {selected.breakdown[c].solves === 1 ? "solve" : "solves"}
                </li>
              ))}
            </ul>
          )}
          <h4>Solve timeline</h4>
          {selected.timeline?.length === 0 ? (
            <p className="muted">No solves yet.</p>
          ) : (
            <ul>
              {selected.timeline?.map((row, i) => (
                <li key={`${row.challengeId}-${i}`}>
                  {row.title} — {row.points + row.bonus} points
                  {row.firstBlood ? " (first blood)" : ""} · solved by{" "}
                  {row.solvedBy} ·{" "}
                  {new Date(row.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h3>Live feed</h3>
        {feed.length === 0 ? (
          <p className="muted">Nothing happened yet — solves show up here as they happen.</p>
        ) : (
          <ul className="feed-list">
            {feed.map((event) => (
              <li key={event.id}>
                <span className="muted">
                  {new Date(event.at).toLocaleTimeString()}
                </span>{" "}
                {eventText(event)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
