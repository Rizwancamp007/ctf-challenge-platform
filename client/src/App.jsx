import { useState } from "react";
import { fetchMe, login, register } from "./api.js";
import AdminChallenges from "./components/AdminChallenges.jsx";
import ChallengeDetail from "./components/ChallengeDetail.jsx";
import ChallengeList from "./components/ChallengeList.jsx";
import LeaderboardPage from "./components/LeaderboardPage.jsx";
import TeamPage from "./components/TeamPage.jsx";

function storedUser() {
  try {
    return JSON.parse(localStorage.getItem("ctf-user") || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(storedUser);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [view, setView] = useState("challenges");

  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("ctf-token")
      : null;

  async function handleAuth(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data =
        mode === "login"
          ? await login(email, password)
          : await register(name, email, password);
      localStorage.setItem("ctf-token", data.token);
      localStorage.setItem("ctf-user", JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setError(err.message || "Something went wrong — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("ctf-token");
    localStorage.removeItem("ctf-user");
    setUser(null);
    setSelectedChallengeId(null);
    setView("challenges");
    setEmail("");
    setPassword("");
    setName("");
  }

  if (!user) {
    return (
      <main>
        <h1>CTF Challenge Platform</h1>
        <p>
          Pick a category — crypto, web, or reverse engineering — open a
          challenge, find the flag, and watch your team climb the leaderboard.
        </p>
        <section>
          <h2>{mode === "login" ? "Log in" : "Create an account"}</h2>
          <form onSubmit={handleAuth}>
            {mode === "register" && (
              <div>
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>
          </form>
          <p>
            {mode === "login" ? (
              <>
                New here?{" "}
                <button type="button" onClick={() => setMode("register")}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")}>
                  Log in
                </button>
              </>
            )}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>CTF Challenge Platform</h1>
          <p className="muted">
            Signed in as {user.name} ({user.role})
          </p>
        </div>
        <nav>
          <button
            type="button"
            onClick={() => {
              setView("challenges");
              setSelectedChallengeId(null);
            }}
            disabled={view === "challenges"}
          >
            Challenges
          </button>{" "}
          <button
            type="button"
            onClick={() => {
              setView("team");
              setSelectedChallengeId(null);
            }}
            disabled={view === "team"}
          >
            Team
          </button>{" "}
          <button
            type="button"
            onClick={() => {
              setView("leaderboard");
              setSelectedChallengeId(null);
            }}
            disabled={view === "leaderboard"}
          >
            Leaderboard
          </button>{" "}
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </nav>
      </header>
      {view === "team" ? (
        <TeamPage token={token} user={user} onUserChange={setUser} />
      ) : view === "leaderboard" ? (
        <LeaderboardPage token={token} user={user} />
      ) : selectedChallengeId ? (
        <ChallengeDetail
          token={token}
          challengeId={selectedChallengeId}
          onBack={() => setSelectedChallengeId(null)}
        />
      ) : (
        <ChallengeList token={token} onSelect={setSelectedChallengeId} />
      )}
      {view === "challenges" && user.role === "admin" && (
        <AdminChallenges token={token} />
      )}
    </main>
  );
}
