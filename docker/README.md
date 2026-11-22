# Containerised web challenges

Each folder is one challenge that runs as its own service. The flag is
passed in with the `FLAG` environment variable when the container
starts — it is never written into the image or the code.

## Bundled challenges

- `web-hidden-flag` (easy) — the flag is a file on the site; `robots.txt`
  points at the folder crawlers are told not to look in.
- `web-source-leak` (medium) — the flag is base64-encoded in a comment in
  the site's JavaScript, so reading the source is only half the job.

Both answer `GET /health` with `{ "status": "ok" }`, which is what the
admin container status check calls.

## Running one by hand

```bash
docker build -t ctf/web-hidden-flag ./web-hidden-flag
docker run --rm -p 8081:3000 -e FLAG='flag{your-flag-here}' ctf/web-hidden-flag
```

## Running with the platform

`docker-compose.yml` at the repo root starts both challenges next to the
API and the client. Set the flags in the compose `.env` (see
`.env.example`):

- `WEB_HIDDEN_FLAG` — flag for the hidden-flag challenge (port 8081)
- `WEB_SOURCE_LEAK_FLAG` — flag for the source-leak challenge (port 8082)

Then, as an admin, create a web challenge in the app and set its
container URL to `http://localhost:8081` or `http://localhost:8082`. The
admin container status view checks each service's `/health` endpoint.

Web challenges run as shared instances in v1 — one container per
challenge, not one per team.
