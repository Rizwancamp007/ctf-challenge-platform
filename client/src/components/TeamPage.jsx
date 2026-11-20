import { useCallback, useEffect, useState } from "react";
import {
  createTeam,
  disbandTeam,
  fetchMe,
  fetchMyTeam,
  fetchTeams,
  joinTeam,
  kickMember,
  leaveTeam,
  regenerateInviteCode,
  transferCaptain,
} from "../api.js";

// The team page: create or join a team, see the roster and the team's
// solves, and — for the captain — manage the roster. A solve counts once
// per team, whoever on the team submits the flag.
export default function TeamPage({ token, user, onUserChange }) {
  const [team, setTeam] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [allTeams, setAllTeams] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const mine = await fetchMyTeam(token);
      setTeam(mine);
    } catch (err) {
      // 404 just means no team yet.
      if (err.status === 404) setTeam(null);
      else setError(err.message || "Could not load your team");
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user.role !== "admin") return;
    fetchTeams(token).then(setAllTeams).catch(() => setAllTeams(null));
  }, [token, user.role, team]);

  async function refreshUser() {
    try {
      const me = await fetchMe(token);
      localStorage.setItem("ctf-user", JSON.stringify(me));
      onUserChange(me);
    } catch {
      // The team view already updated — a stale header is harmless.
    }
  }

  async function run(action, successMessage) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === "object" && "members" in result) {
        setTeam(result);
      }
      if (successMessage) setNotice(successMessage);
      await refreshUser();
      return result;
    } catch (err) {
      setError(err.message || "Something went wrong — please try again");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    await run(() => createTeam(teamName, token), "Team created — share the invite code");
    setTeamName("");
  }

  async function handleJoin(e) {
    e.preventDefault();
    await run(() => joinTeam(inviteInput, token), "Welcome to the team");
    setInviteInput("");
  }

  async function handleLeave() {
    const result = await run(() => leaveTeam(token), "You left the team");
    if (result) setTeam(result.team);
    setConfirming(null);
  }

  async function handleDisband() {
    await run(async () => {
      await disbandTeam(team.id, token);
      setTeam(null);
      setAllTeams(null);
      return null;
    }, "Team disbanded");
    setConfirming(null);
  }

  function copyCode() {
    if (!team?.inviteCode) return;
    const done = () => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(team.inviteCode).then(done, done);
    } else {
      done();
    }
  }

  if (!loaded) {
    return <p>Loading your team…</p>;
  }

  const isCaptain = team && team.captainId === user.id;

  return (
    <section>
      <h2>Your team</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}

      {!team && (
        <>
          <p className="muted">
            Teams solve together — up to four players, one shared score, and
            a challenge counts once per team, whoever submits the flag.
          </p>
          <div>
            <h3>Create a team</h3>
            <form onSubmit={handleCreate}>
              <div>
                <label htmlFor="team-name">Team name</label>
                <input
                  id="team-name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Byte Force"
                  maxLength={60}
                />
              </div>
              <button type="submit" disabled={busy || !teamName.trim()}>
                Create team
              </button>
            </form>
          </div>
          <div>
            <h3>Join a team</h3>
            <form onSubmit={handleJoin}>
              <div>
                <label htmlFor="invite-code">Invite code</label>
                <input
                  id="invite-code"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                  placeholder="K7Q2M9XD"
                  maxLength={8}
                />
              </div>
              <button type="submit" disabled={busy || !inviteInput.trim()}>
                Join team
              </button>
            </form>
          </div>
        </>
      )}

      {team && (
        <>
          <h3>{team.name}</h3>
          <p className="muted">
            {team.score} points · {team.solveCount}{" "}
            {team.solveCount === 1 ? "solve" : "solves"} · {team.memberCount}
            /4 players
          </p>
          <div>
            <h4>Invite code</h4>
            <p>
              <code>{team.inviteCode}</code>{" "}
              <button type="button" onClick={copyCode} disabled={busy}>
                {codeCopied ? "Copied" : "Copy"}
              </button>
            </p>
            <p className="muted">
              Share this code with your teammates — anyone with it can join
              while there is room.
            </p>
            {isCaptain && (
              <button
                type="button"
                onClick={() =>
                  run(
                    () => regenerateInviteCode(team.id, token),
                    "New invite code — the old one no longer works"
                  )
                }
                disabled={busy}
              >
                New invite code
              </button>
            )}
          </div>

          <div>
            <h4>Members</h4>
            <ul>
              {team.members.map((member) => (
                <li key={member.id}>
                  {member.name}
                  {member.id === team.captainId && " (captain)"}
                  {member.id === user.id && " — you"}
                  {isCaptain && member.id !== user.id && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            () => transferCaptain(team.id, member.id, token),
                            `${member.name} is captain now`
                          )
                        }
                        disabled={busy}
                      >
                        Make captain
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            () => kickMember(team.id, member.id, token),
                            `${member.name} was removed from the team`
                          )
                        }
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Solves</h4>
            {team.solves.length === 0 ? (
              <p className="muted">No solves yet — pick a challenge and get going.</p>
            ) : (
              <ul>
                {team.solves.map((solve) => (
                  <li key={solve.challengeId}>
                    {solve.title} — {solve.points + solve.bonus} points
                    {solve.firstBlood ? " (first blood)" : ""} · solved by{" "}
                    {solve.solvedBy}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            {confirming === "leave" ? (
              <p>
                Leave {team.name}?{" "}
                {isCaptain && team.memberCount > 1
                  ? "The longest-standing member becomes captain."
                  : ""}
                <button type="button" onClick={handleLeave} disabled={busy}>
                  Yes, leave
                </button>{" "}
                <button type="button" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </p>
            ) : confirming === "disband" ? (
              <p>
                Disband {team.name}? This can't be undone.{" "}
                <button type="button" onClick={handleDisband} disabled={busy}>
                  Yes, disband
                </button>{" "}
                <button type="button" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </p>
            ) : (
              <>
                <button type="button" onClick={() => setConfirming("leave")} disabled={busy}>
                  Leave team
                </button>{" "}
                {isCaptain && (
                  <button
                    type="button"
                    onClick={() => setConfirming("disband")}
                    disabled={busy}
                  >
                    Disband team
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {user.role === "admin" && allTeams && (
        <div>
          <h3>All teams</h3>
          {allTeams.length === 0 ? (
            <p className="muted">No teams yet.</p>
          ) : (
            <ul>
              {allTeams.map((t) => (
                <li key={t.id}>
                  {t.name} — {t.memberCount}/4 players
                  {t.id !== team?.id && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={async () => {
                          await disbandTeam(t.id, token);
                          setAllTeams((prev) => prev.filter((x) => x.id !== t.id));
                        }}
                        disabled={busy}
                      >
                        Disband
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
