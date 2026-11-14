import type { AnalyticsEventType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type StatsBreakdownRow = {
  id: string;
  name: string;
  count: number;
};

export type StatsDayCount = {
  date: string;
  count: number;
};

export type StatsOverview = {
  days: number;
  entityId: string | null;
  from: string;
  to: string;
  health: {
    notFound404: number;
    formSubmitError: number;
    emailError: number;
    makeError: number;
    makeComingSoon: true;
  };
  analytics: {
    successfulSubmissions: number;
    submissionsByDay: StatsDayCount[];
    bySeller: StatsBreakdownRow[];
    byLocation: StatsBreakdownRow[];
    byCategory: StatsBreakdownRow[];
  };
};

const TOP_LIMIT = 10;

function countOf(
  rows: Array<{ type: AnalyticsEventType; _count: { id: number } }>,
  type: AnalyticsEventType,
) {
  return rows.find((row) => row.type === type)?._count.id ?? 0;
}

async function resolveNames(
  kind: "seller" | "location" | "category",
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  if (kind === "seller") {
    const rows = await prisma.seller.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  if (kind === "location") {
    const rows = await prisma.location.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  const rows = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function submissionsByDaySeries(
  where: Prisma.AnalyticsEventWhereInput,
  to: Date,
  days: number,
): Promise<StatsDayCount[]> {
  const events = await prisma.analyticsEvent.findMany({
    where,
    select: { createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const event of events) {
    const key = dayKey(event.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: StatsDayCount[] = [];
  const cursor = new Date(to);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));

  for (let i = 0; i < days; i += 1) {
    const key = dayKey(cursor);
    series.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

async function topBreakdown(
  where: Prisma.AnalyticsEventWhereInput,
  field: "sellerId" | "locationId" | "categoryId",
  kind: "seller" | "location" | "category",
): Promise<StatsBreakdownRow[]> {
  const groups = await prisma.analyticsEvent.groupBy({
    by: [field],
    where: {
      ...where,
      [field]: { not: null },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: TOP_LIMIT,
  });

  const ids = groups
    .map((row) => row[field])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const names = await resolveNames(kind, ids);

  return groups.flatMap((row) => {
    const id = row[field];
    if (!id) return [];
    return [
      {
        id,
        name: names.get(id) || "Onbekend",
        count: row._count.id,
      },
    ];
  });
}

export async function getStatsOverview(input: {
  days: number;
  entityId?: string | null;
}): Promise<StatsOverview> {
  const days = Math.min(Math.max(input.days || 30, 1), 180);
  const to = new Date();
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  const where: Prisma.AnalyticsEventWhereInput = {
    createdAt: { gte: from, lte: to },
    ...(input.entityId ? { entityId: input.entityId } : {}),
  };

  const successWhere: Prisma.AnalyticsEventWhereInput = {
    ...where,
    type: "FORM_SUBMIT_SUCCESS",
  };

  const [
    typeCounts,
    successfulSubmissions,
    submissionsByDay,
    bySeller,
    byLocation,
    byCategory,
  ] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["type"],
      where,
      _count: { id: true },
    }),
    prisma.analyticsEvent.count({ where: successWhere }),
    submissionsByDaySeries(successWhere, to, days),
    topBreakdown(successWhere, "sellerId", "seller"),
    topBreakdown(successWhere, "locationId", "location"),
    topBreakdown(successWhere, "categoryId", "category"),
  ]);

  return {
    days,
    entityId: input.entityId || null,
    from: from.toISOString(),
    to: to.toISOString(),
    health: {
      notFound404: countOf(typeCounts, "NOT_FOUND_404"),
      formSubmitError: countOf(typeCounts, "FORM_SUBMIT_ERROR"),
      emailError: countOf(typeCounts, "EMAIL_ERROR"),
      makeError: 0,
      makeComingSoon: true,
    },
    analytics: {
      successfulSubmissions,
      submissionsByDay,
      bySeller,
      byLocation,
      byCategory,
    },
  };
}
