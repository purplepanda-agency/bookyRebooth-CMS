import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { resolveEntityFilter } from "../../lib/entityScope.js";
import { getStatsOverview } from "./stats.service.js";

export const statsRouter = Router();

statsRouter.use(requireAuth);

/**
 * GET /api/stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&entityId=
 * Legacy: ?days=30 still works when from/to are omitted.
 * Admins are limited to their assigned entities. Super admins may filter.
 */
statsRouter.get("/overview", async (req, res, next) => {
  try {
    const from =
      typeof req.query.from === "string" && req.query.from.trim()
        ? req.query.from.trim()
        : null;
    const to =
      typeof req.query.to === "string" && req.query.to.trim()
        ? req.query.to.trim()
        : null;
    const daysRaw = typeof req.query.days === "string" ? req.query.days : null;
    const days = daysRaw ? Number.parseInt(daysRaw, 10) : undefined;
    const queryEntityId =
      typeof req.query.entityId === "string" && req.query.entityId.trim()
        ? req.query.entityId.trim()
        : null;

    const scope = resolveEntityFilter(req.user!, queryEntityId);
    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const overview = await getStatsOverview({
      from,
      to,
      days: days !== undefined && Number.isFinite(days) ? days : undefined,
      entityId: scope.entityId || null,
      entityIds: scope.entityIds ?? null,
    });

    res.json({ overview });
  } catch (error) {
    next(error);
  }
});
