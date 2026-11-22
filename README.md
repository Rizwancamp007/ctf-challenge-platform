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
Never commit the real `.env`. For `docker compose`, copy `.env.example`
at the repo root to `.env` as well — it holds the flags for the bundled
containerised challenges.

| Variable | What it is |
| --- | --- |
| `PORT` | API port (default 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign login tokens |
| `JWT_EXPIRES_IN` | How long a login token lasts (default 7d) |
| `CLIENT_URL` | Client origin allowed by CORS |
| `FLAG_SALT` | Salt mixed into challenge flag hashes |
| `WEB_HIDDEN_FLAG` / `WEB_SOURCE_LEAK_FLAG` | Flags for the bundled containerised web challenges (compose `.env` only) |
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

## Hints

Admins can add hints to any challenge, each with a point cost. A hint is
locked until a team unlocks it — locked hints show their cost and nothing
else. Unlocking is per team: one teammate unlocking it opens it for the
whole team, and nobody pays twice for the same hint. The cost comes off
the team's score at the moment of unlocking, so a hint is a trade: a
nudge now against a few places on the board. A hint can only be bought
with points the team has already earned — a team with no points yet has
to solve something first.

## Containerised web challenges

Web challenges can run as their own services. Two are bundled in
`docker/`:

- `web-hidden-flag` (easy, port 8081) — the flag is a file on the site;
  `robots.txt` points at the folder crawlers are told not to look in.
- `web-source-leak` (medium, port 8082) — the flag is base64-encoded in a
  comment in the site's JavaScript.

Each one is a small Node server with a `GET /health` endpoint, and the
flag arrives through the `FLAG` environment variable when the container
starts — it is never baked into the image. `docker compose up --build`
starts both next to the API and the client; set `WEB_HIDDEN_FLAG` and
`WEB_SOURCE_LEAK_FLAG` in the compose `.env` (see `.env.example`). As an
admin, create a web challenge and set its container URL to
`http://localhost:8081` or `http://localhost:8082`; the admin container
status view checks each service's `/health` endpoint and shows whether
it is up. Web challenges run as shared instances — one container per
challenge, not one per team.

## Scoring

A challenge is worth its full base points to the first solver, then falls
towards a floor (a quarter of its base points, never less than 10) as more
solvers crack it, so early solves are worth more. The first solver also
earns a 25-point first-blood bonus. Totals are recomputed from the solve
records, and ties break on who reached the total first. Flag guesses are
capped at 10 per minute per solver, and five wrong guesses in a row earn
a one-minute cooldown.

## Leaderboard and live updates

The leaderboard ranks teams by points, then by who reached the total
first, and shows where each team's points came from — a breakdown per
category — plus a per-team solve timeline. Solves show up on the board as
they happen: the API keeps a live feed of solves, first bloods and
position changes, and pushes it to the scoreboard page over a socket, so
the board moves without refreshing. If the live connection drops, the
page falls back to refreshing every 30 seconds.

Admins can freeze the scoreboard while the event is still running: the
public board holds at the standings from the moment of the freeze, while
admins keep seeing the live board. Unfreezing shows the live board to
everyone again.

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
- `GET /api/challenges/:id/hints` — hints for a challenge (locked hints show their cost, not their text)
- `POST /api/challenges/:id/hints` — add a hint to a challenge (admin only)
- `PUT /api/challenges/:id/hints/:hintId` — edit a hint (admin only)
- `DELETE /api/challenges/:id/hints/:hintId` — delete a hint (admin only)
- `POST /api/challenges/:id/hints/:hintId/unlock` — unlock a hint for your team, charged against your score
- `GET /api/containers` — container status for every challenge service (admin only)
- `POST /api/teams/join` — join a team with its invite code
- `GET /api/teams/me` — your team: members, solves and score
- `GET /api/teams/:id` — one team's profile
- `GET /api/teams` — every team (admin only)
- `POST /api/teams/leave` — leave your team
- `POST /api/teams/:id/kick` — remove a member (captain only)
- `POST /api/teams/:id/transfer` — hand over the captaincy (captain only)
- `POST /api/teams/:id/regenerate-code` — get a fresh invite code (captain only)
- `DELETE /api/teams/:id` — disband a team (captain or admin)
- `GET /api/leaderboard` — ranked standings (points, then earliest last solve), with a per-team category breakdown; `frozen` says whether the public board is frozen
- `GET /api/leaderboard/feed` — the live feed: solves, first bloods, position changes and freezes
- `GET /api/leaderboard/:id` — one solver's rank, breakdown and solve timeline
- `POST /api/leaderboard/freeze` — freeze the public board (admin only)
- `POST /api/leaderboard/unfreeze` — show the live board again (admin only)

Flags are stored as salted hashes, never in plain text, and never sent
to the client. A challenge counts once per solver.

Full API and deploy guides are kept with the project docs.
