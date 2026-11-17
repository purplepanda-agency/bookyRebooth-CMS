import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";

export const activityRouter = Router();

activityRouter.use(requireAuth, requireRole("SUPER_ADMIN"));

const DEFAULT_PAGE_SIZE = 20;

/** Plural label → variants stored in entryType / legacy summaries. */
const ENTRY_TYPE_VARIANTS: Record<string, string[]> = {
  Entiteiten: ["Entiteiten", "Entiteit"],
  Gebruikers: ["Gebruikers", "Gebruiker"],
  Locaties: ["Locaties", "Locatie"],
  Verkopers: ["Verkopers", "Verkoper"],
  Categorieën: ["Categorieën", "Categorie"],
  Flows: ["Flows", "Flow"],
  Contentblokken: ["Contentblokken", "Contentblok"],
  "Product sets": ["Product sets", "Product set", "Producten", "Product"],
};

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

function queryPage(value: unknown) {
  if (typeof value !== "string") return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function queryLimit(value: unknown) {
  if (typeof value !== "string") return DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(parsed, 1), 100);
}

function queryEntryType(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

function queryDate(value: unknown, endOfDay: boolean) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function entryTypeWhere(entryType: string): Prisma.ActivityLogWhereInput {
  const variants = ENTRY_TYPE_VARIANTS[entryType] ?? [entryType];
  return {
    OR: [
      { entryType: { in: variants } },
      ...variants.map((variant) => ({
        entryType: { contains: variant },
      })),
      ...variants.map((variant) => ({
        AND: [{ entryType: null }, { summary: { contains: variant } }],
      })),
    ],
  };
}

activityRouter.get("/", async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const userId = queryId(req.query.userId);
    const entityId = queryId(req.query.entityId);
    const entryType = queryEntryType(req.query.entryType);
    const dateFrom = queryDate(req.query.dateFrom, false);
    const dateTo = queryDate(req.query.dateTo, true);
    const page = queryPage(req.query.page);
    const limit = queryLimit(req.query.limit);

    const filters: Prisma.ActivityLogWhereInput[] = [];

    if (userId) filters.push({ userId });
    if (entityId) {
      filters.push({
        OR: [
          { entityId },
          { entityIds: { contains: `,${entityId},` } },
        ],
      });
    }
    if (entryType) filters.push(entryTypeWhere(entryType));
    if (dateFrom || dateTo) {
      filters.push({
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      });
    }
    if (q) {
      filters.push({
        OR: [
          { summary: { contains: q } },
          { detail: { contains: q } },
          { entryType: { contains: q } },
          { userEmail: { contains: q } },
          { entityName: { contains: q } },
        ],
      });
    }

    const where: Prisma.ActivityLogWhereInput =
      filters.length > 0 ? { AND: filters } : {};

    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);

    res.json({
      entries: rows.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        userId: entry.userId,
        userEmail: entry.userEmail,
        userRole: entry.userRole,
        action: entry.action,
        entryType: entry.entryType,
        summary: entry.summary,
        detail: entry.detail,
        entityId: entry.entityId,
        entityName: entry.entityName,
      })),
      page: safePage,
      pageSize: limit,
      total,
      totalPages,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.json({
        entries: [],
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        totalPages: 1,
      });
      return;
    }
    next(error);
  }
});
