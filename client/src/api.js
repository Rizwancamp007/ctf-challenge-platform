const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// A dropped connection or a server that isn't running shows up as a bare
// fetch failure — turn it into something a user can act on.
function friendlyError(err) {
  if (err instanceof TypeError) {
    return new Error("Could not reach the server — check your connection and try again");
  }
  return err;
}

async function request(method, path, body, token) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw friendlyError(err);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = res.status;
    throw error;
  }
  return data;
}

export function login(email, password) {
  return request("POST", "/api/auth/login", { email, password });
}

export function register(name, email, password) {
  return request("POST", "/api/auth/register", { name, email, password });
}

export function fetchMe(token) {
  return request("GET", "/api/auth/me", undefined, token).then((d) => d.user);
}

export function listChallenges(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(
    "GET",
    `/api/challenges${query ? `?${query}` : ""}`,
    undefined,
    token
  ).then((d) => d.challenges);
}

export function getChallenge(id, token) {
  return request("GET", `/api/challenges/${id}`, undefined, token).then(
    (d) => d.challenge
  );
}

export function createChallenge(data, token) {
  return request("POST", "/api/challenges", data, token).then(
    (d) => d.challenge
  );
}

export function updateChallenge(id, data, token) {
  return request("PUT", `/api/challenges/${id}`, data, token).then(
    (d) => d.challenge
  );
}

export function deleteChallenge(id, token) {
  return request("DELETE", `/api/challenges/${id}`, undefined, token);
}

export function submitFlag(id, flag, token) {
  return request("POST", `/api/challenges/${id}/submit`, { flag }, token);
}

export function fetchLeaderboard(token) {
  return request("GET", "/api/leaderboard", undefined, token);
}

export function fetchLeaderboardFeed(token) {
  return request("GET", "/api/leaderboard/feed", undefined, token).then(
    (d) => d.events
  );
}

export function fetchLeaderboardEntry(id, token) {
  return request("GET", `/api/leaderboard/${id}`, undefined, token);
}

export function freezeLeaderboard(token) {
  return request("POST", "/api/leaderboard/freeze", {}, token);
}

export function unfreezeLeaderboard(token) {
  return request("POST", "/api/leaderboard/unfreeze", {}, token);
}

export function createTeam(name, token) {
  return request("POST", "/api/teams", { name }, token).then((d) => d.team);
}

export function joinTeam(inviteCode, token) {
  return request("POST", "/api/teams/join", { inviteCode }, token).then(
    (d) => d.team
  );
}

export function fetchMyTeam(token) {
  return request("GET", "/api/teams/me", undefined, token).then((d) => d.team);
}

export function fetchTeam(id, token) {
  return request("GET", `/api/teams/${id}`, undefined, token).then(
    (d) => d.team
  );
}

export function fetchTeams(token) {
  return request("GET", "/api/teams", undefined, token).then((d) => d.teams);
}

export function leaveTeam(token) {
  return request("POST", "/api/teams/leave", {}, token);
}

export function kickMember(teamId, userId, token) {
  return request("POST", `/api/teams/${teamId}/kick`, { userId }, token).then(
    (d) => d.team
  );
}

export function transferCaptain(teamId, userId, token) {
  return request(
    "POST",
    `/api/teams/${teamId}/transfer`,
    { userId },
    token
  ).then((d) => d.team);
}

export function regenerateInviteCode(teamId, token) {
  return request(
    "POST",
    `/api/teams/${teamId}/regenerate-code`,
    {},
    token
  ).then((d) => d.team);
}

export function disbandTeam(teamId, token) {
  return request("DELETE", `/api/teams/${teamId}`, undefined, token);
}
