import { useState } from "react";
import { fetchMe, login, register } from "./api.js";

const CATEGORIES = [
  {
    name: "Crypto",
    description: "Ciphers, encodings and number theory — break the code, find the flag.",
  },
  {
    name: "Web",
    description: "Broken auth, injection and logic flaws hiding in plain sight.",
  },
  {
    name: "Reverse engineering",
    description: "Binaries and bytecode — take it apart and see how it works.",
  },
  {
    name: "Misc",
    description: "Forensics, trivia and everything that doesn't fit the other boxes.",
  },
];

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
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <section>
        <h2>Challenges</h2>
        <ul className="categories">
          {CATEGORIES.map((category) => (
            <li key={category.name} className="category-card">
              <h3>{category.name}</h3>
              <p>{category.description}</p>
              <p className="muted">No challenges yet.</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
