import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// Admin view of the challenge containers: each challenge that runs as a
// service gets its health endpoint checked, so the admin can see at a
// glance which challenge services are up. The check only ever hits URLs
// already stored on the challenge itself.
export function createContainersRouter({ challenges } = {}) {
  const router = express.Router();

  async function checkHealth(url) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return "down";
      const body = await res.json().catch(() => ({}));
      return body.status === "ok" ? "up" : "down";
    } catch {
      return "down";
    }
  }

  router.get(
    "/",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const list = await challenges.list({ includeHidden: true });
      const out = [];
      for (const challenge of list) {
        const url = challenge.container?.url?.trim();
        if (!challenge.container || !url) {
          out.push({
            challengeId: String(challenge.id ?? challenge._id),
            title: challenge.title,
            url: null,
            status: "not-configured",
            checkedAt: new Date().toISOString(),
          });
          continue;
        }
        out.push({
          challengeId: String(challenge.id ?? challenge._id),
          title: challenge.title,
          url,
          status: await checkHealth(url),
          checkedAt: new Date().toISOString(),
        });
      }
      return res.json({ containers: out });
    })
  );

  return router;
}
