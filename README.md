# CTF Challenge Platform

A custom Capture The Flag platform. Players register, join a team, solve
challenges across crypto, web, reverse engineering and misc, and climb the
live leaderboard. Admins write challenges, manage teams and run the event.

## Stack

React (Vite) + Node.js/Express + MongoDB + JWT + Docker.

## Running it locally

```bash
docker compose up --build
```

The client runs on http://localhost:5173, the API on
http://localhost:5000, MongoDB on localhost:27017.

Or run each part by hand:

```bash
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

## Environment

Copy `server/.env.example` to `server/.env` and fill in your own values.
Never commit the real `.env`.

| Variable | What it is |
| --- | --- |
| `PORT` | API port (default 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign login tokens |
| `JWT_EXPIRES_IN` | How long a login token lasts (default 7d) |
| `CLIENT_URL` | Client origin allowed by CORS |
| `FLAG_SALT` | Salt mixed into challenge flag hashes |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | Demo admin account, used by `npm run seed` |
| `DEMO_PLAYER_EMAIL` / `DEMO_PLAYER_PASSWORD` | Demo player account, used by `npm run seed` |

## Demo accounts

Set the `DEMO_*` variables in your local `.env` (or in deployment config)
and run `npm run seed` from `server/`. Demo credentials live only in
environment variables — never in the repo.

## Teams

Players solve in teams of up to four. One player creates a team and shares
its invite code; the rest join with that code. A challenge counts once per
team, whoever on the team submits the flag, and flag guesses share one
budget per team. The captain manages the roster — remove a member, hand
over the captaincy, or get a fresh invite code. When the captain leaves,
the longest-standing member takes over; when the last member leaves, the
team is disbanded. Admins can list every team and disband any of them.

## Scoring

A challenge is worth its full base points to the first solver, then falls
towards a floor (a quarter of its base points, never less than 10) as more
solvers crack it, so early solves are worth more. The first solver also
earns a 25-point first-blood bonus. Totals are recomputed from the solve
records, and ties break on who reached the total first. Flag guesses are
capped at 10 per minute per solver, and five wrong guesses in a row earn
a one-minute cooldown.

## API

- `GET /health` — server status
- `POST /api/auth/register` — create a player account
- `POST /api/auth/login` — log in, returns a JWT
- `GET /api/auth/me` — the logged-in account
- `GET /api/challenges` — list visible challenges (optional `?category=` and `?difficulty=` filters; admins also see hidden ones)
- `GET /api/challenges/:id` — one challenge
- `POST /api/challenges/:id/submit` — submit a flag (10 guesses per minute per solver)
- `POST /api/challenges` — create a challenge (admin only)
- `PUT /api/challenges/:id` — update a challenge, including rotating its flag (admin only)
- `DELETE /api/challenges/:id` — delete a challenge and its solves (admin only)
- `POST /api/teams` — create a team (you become captain)
- `POST /api/teams/join` — join a team with its invite code
- `GET /api/teams/me` — your team: members, solves and score
- `GET /api/teams/:id` — one team's profile
- `GET /api/teams` — every team (admin only)
- `POST /api/teams/leave` — leave your team
- `POST /api/teams/:id/kick` — remove a member (captain only)
- `POST /api/teams/:id/transfer` — hand over the captaincy (captain only)
- `POST /api/teams/:id/regenerate-code` — get a fresh invite code (captain only)
- `DELETE /api/teams/:id` — disband a team (captain or admin)
- `GET /api/leaderboard` — ranked standings (points, then earliest last solve)

Flags are stored as salted hashes, never in plain text, and never sent
to the client. A challenge counts once per solver.

Full API and deploy guides are kept with the project docs.
