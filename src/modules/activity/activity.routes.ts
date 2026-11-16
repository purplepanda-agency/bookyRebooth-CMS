import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";

export const activityRouter = Router();

activityRouter.use(requireAuth, requireRole("SUPER_ADMIN"));

function queryText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

function queryId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[\w-]{8,64}$/.test(trimmed)) return null;
  return trimmed;
}

activityRouter.get("/", async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const userId = queryId(req.query.userId);
    const entityId = queryId(req.query.entityId);
    const cursor = queryId(req.query.cursor);
    const limitRaw =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const where = {
      ...(userId ? { userId } : {}),
      ...(entityId
        ? {
            OR: [
              { entityId },
              { entityIds: { contains: `,${entityId},` } },
            ],
          }
        : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { summary: { contains: q } },
                  { detail: { contains: q } },
                  { userEmail: { contains: q } },
                  { entityName: { contains: q } },
                ],
              },
            ],
          }
        : {}),
    };

    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      entries: entries.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        userId: entry.userId,
        userEmail: entry.userEmail,
        userRole: entry.userRole,
        action: entry.action,
        summary: entry.summary,
        detail: entry.detail,
        entityId: entry.entityId,
        entityName: entry.entityName,
      })),
      nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.json({ entries: [], nextCursor: null });
      return;
    }
    next(error);
  }
});
