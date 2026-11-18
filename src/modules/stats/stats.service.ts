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

export type StatsDayMetrics = {
  date: string;
  success: number;
  failed: number;
  emailError: number;
  webhookError: number;
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
    webhookError: number;
  };
  analytics: {
    successfulSubmissions: number;
    failedSubmissions: number;
    emailErrors: number;
    webhookErrors: number;
    metricsByDay: StatsDayMetrics[];
    bySeller: StatsBreakdownRow[];
    byLocation: StatsBreakdownRow[];
    byCategory: StatsBreakdownRow[];
  };
};

const TOP_LIMIT = 10;

const CHART_TYPES: AnalyticsEventType[] = [
  "FORM_SUBMIT_SUCCESS",
  "FORM_SUBMIT_ERROR",
  "EMAIL_ERROR",
  "MAKE_ERROR",
];

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** Parse YYYY-MM-DD as local calendar day; returns null if invalid. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return startOfDay(date);
}

function defaultRange(): { from: Date; to: Date } {
  const to = startOfDay(new Date());
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to };
}

function resolveRange(input: {
  from?: string | null;
  to?: string | null;
}): { from: Date; to: Date; days: number } {
  const defaults = defaultRange();
  let from = parseDateOnly(input.from) ?? defaults.from;
  let to = parseDateOnly(input.to) ?? defaults.to;

  if (from.getTime() > to.getTime()) {
    const swap = from;
    from = to;
    to = swap;
  }

  let days =
    Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY) +
    1;

  if (days > MAX_RANGE_DAYS) {
    from = new Date(to);
    from.setDate(from.getDate() - (MAX_RANGE_DAYS - 1));
    days = MAX_RANGE_DAYS;
  }

  return { from: startOfDay(from), to: endOfDay(to), days };
}

async function metricsByDaySeries(
  where: Prisma.AnalyticsEventWhereInput,
  from: Date,
  days: number,
): Promise<StatsDayMetrics[]> {
  const events = await prisma.analyticsEvent.findMany({
    where: {
      ...where,
      type: { in: CHART_TYPES },
    },
    select: { createdAt: true, type: true },
  });

  const counts = new Map<
    string,
    {
      success: number;
      failed: number;
      emailError: number;
      webhookError: number;
    }
  >();

  for (const event of events) {
    const key = dayKey(event.createdAt);
    const bucket = counts.get(key) ?? {
      success: 0,
      failed: 0,
      emailError: 0,
      webhookError: 0,
    };

    if (event.type === "FORM_SUBMIT_SUCCESS") bucket.success += 1;
    else if (event.type === "FORM_SUBMIT_ERROR") bucket.failed += 1;
    else if (event.type === "EMAIL_ERROR") bucket.emailError += 1;
    else if (event.type === "MAKE_ERROR") bucket.webhookError += 1;

    counts.set(key, bucket);
  }

  const series: StatsDayMetrics[] = [];
  const cursor = startOfDay(from);

  for (let i = 0; i < days; i += 1) {
    const key = dayKey(cursor);
    const bucket = counts.get(key);
    series.push({
      date: key,
      success: bucket?.success ?? 0,
      failed: bucket?.failed ?? 0,
      emailError: bucket?.emailError ?? 0,
      webhookError: bucket?.webhookError ?? 0,
    });
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
  from?: string | null;
  to?: string | null;
  /** @deprecated prefer from/to; kept for backwards compatibility */
  days?: number;
  entityId?: string | null;
  entityIds?: string[] | null;
}): Promise<StatsOverview> {
  let range = resolveRange({ from: input.from, to: input.to });

  // Legacy ?days= support when no explicit from/to was provided.
  if (!input.from && !input.to && input.days) {
    const days = Math.min(Math.max(input.days, 1), MAX_RANGE_DAYS);
    const to = endOfDay(new Date());
    const from = startOfDay(new Date());
    from.setDate(from.getDate() - (days - 1));
    range = { from, to, days };
  }

  const { from, to, days } = range;

  const where: Prisma.AnalyticsEventWhereInput = {
    createdAt: { gte: from, lte: to },
    ...(input.entityId
      ? { entityId: input.entityId }
      : input.entityIds?.length
        ? { entityId: { in: input.entityIds } }
        : {}),
  };

  const successWhere: Prisma.AnalyticsEventWhereInput = {
    ...where,
    type: "FORM_SUBMIT_SUCCESS",
  };

  const [typeCounts, metricsByDay, bySeller, byLocation, byCategory] =
    await Promise.all([
      prisma.analyticsEvent.groupBy({
        by: ["type"],
        where,
        _count: { id: true },
      }),
      metricsByDaySeries(where, from, days),
      topBreakdown(successWhere, "sellerId", "seller"),
      topBreakdown(successWhere, "locationId", "location"),
      topBreakdown(successWhere, "categoryId", "category"),
    ]);

  const successfulSubmissions = countOf(typeCounts, "FORM_SUBMIT_SUCCESS");
  const failedSubmissions = countOf(typeCounts, "FORM_SUBMIT_ERROR");
  const emailErrors = countOf(typeCounts, "EMAIL_ERROR");
  // DB enum blijft MAKE_ERROR (legacy); UI/API tonen dit als webhook-fouten.
  const webhookErrors = countOf(typeCounts, "MAKE_ERROR");

  return {
    days,
    entityId: input.entityId || null,
    from: dayKey(from),
    to: dayKey(to),
    health: {
      notFound404: countOf(typeCounts, "NOT_FOUND_404"),
      formSubmitError: failedSubmissions,
      emailError: emailErrors,
      webhookError: webhookErrors,
    },
    analytics: {
      successfulSubmissions,
      failedSubmissions,
      emailErrors,
      webhookErrors,
      metricsByDay,
      bySeller,
      byLocation,
      byCategory,
    },
  };
}
