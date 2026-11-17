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
