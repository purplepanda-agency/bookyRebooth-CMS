import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  canAccessEntity,
  prismaEntityWhere,
  resolveEntityFilter,
  resolveEntityIdForWrite,
} from "../../lib/entityScope.js";
import { expandExceptionDates } from "../../lib/scheduleExceptions.js";
import { createSellerSchema, updateSellerSchema } from "./sellers.schemas.js";

export const sellersRouter = Router();

sellersRouter.use(requireAuth);

const sellerInclude = {
  entity: { select: { id: true, name: true, slug: true } },
  primaryLocation: {
    select: { id: true, name: true, permalink: true },
  },
  categories: {
    select: { id: true, name: true, slug: true, imageUrl: true },
    orderBy: { name: "asc" as const },
  },
  schedules: {
    orderBy: { weekday: "asc" as const },
    include: {
      location: {
        select: { id: true, name: true, permalink: true },
      },
    },
  },
  exceptions: {
    orderBy: { startDate: "asc" as const },
    include: {
      location: {
        select: { id: true, name: true, permalink: true },
      },
    },
  },
};

function exceptionRows(
  exceptions: Array<{
    kind: "OFF" | "WORKING";
    startDate: string;
    endDate: string;
    repeatEvery: number;
    repeatUnit: "DAY" | "WEEK" | "MONTH";
    excludedDates: string[];
    startTime?: string | null;
    endTime?: string | null;
    locationId?: string | null;
  }>,
) {
  return exceptions.map((item) => {
    const generated = new Set(
      expandExceptionDates({
        startDate: item.startDate,
        endDate: item.endDate,
        repeatEvery: item.repeatEvery,
        repeatUnit: item.repeatUnit,
      }),
    );
    const working = item.kind === "WORKING";
    return {
      kind: item.kind,
      startDate: item.startDate,
      endDate: item.endDate,
      repeatEvery: item.repeatEvery,
      repeatUnit: item.repeatUnit,
      excludedDates: item.excludedDates.filter((date) => generated.has(date)),
      startTime: working ? (item.startTime ?? null) : null,
      endTime: working ? (item.endTime ?? null) : null,
      locationId: working ? (item.locationId ?? null) : null,
    };
  });
}

sellersRouter.get("/", async (req, res, next) => {
  try {
    const filter = resolveEntityFilter(
      req.user!,
      typeof req.query.entityId === "string" ? req.query.entityId : null,
    );

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    const sellers = await prisma.seller.findMany({
      where: prismaEntityWhere(filter),
      orderBy: { name: "asc" },
      include: sellerInclude,
    });

    res.json({ sellers });
  } catch (error) {
    next(error);
  }
});

sellersRouter.get("/:id", async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({
      where: { id: req.params.id },
      include: sellerInclude,
    });

    if (!seller) {
      res.status(404).json({ error: "Verkoper niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, seller.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ seller });
  } catch (error) {
    next(error);
  }
});

async function assertLocationsBelongToEntity(
  locationIds: string[],
  entityId: string,
): Promise<string | null> {
  if (locationIds.length === 0) return null;

  const uniqueIds = [...new Set(locationIds)];
  const count = await prisma.location.count({
    where: {
      id: { in: uniqueIds },
      entityId,
    },
  });

  if (count !== uniqueIds.length) {
    return "Een of meer locaties horen niet bij deze entiteit";
  }

  return null;
}

async function assertCategoriesBelongToEntity(
  categoryIds: string[],
  entityId: string,
): Promise<string | null> {
  if (categoryIds.length === 0) return null;

  const uniqueIds = [...new Set(categoryIds)];
  const count = await prisma.category.count({
    where: {
      id: { in: uniqueIds },
      entityId,
    },
  });

  if (count !== uniqueIds.length) {
    return "Een of meer categorieën horen niet bij deze entiteit";
  }

  return null;
}

sellersRouter.post("/", async (req, res, next) => {
  try {
    const body = createSellerSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id: scope.entityId },
    });

    if (!entity) {
      res.status(400).json({ error: "entityId does not exist" });
      return;
    }

    const locationError = await assertLocationsBelongToEntity(
      [
        body.primaryLocationId,
        ...body.schedules.map((item) => item.locationId),
        ...body.exceptions.flatMap((item) =>
          item.kind === "WORKING" && item.locationId ? [item.locationId] : [],
        ),
      ],
      scope.entityId,
    );

    if (locationError) {
      res.status(400).json({ error: locationError });
      return;
    }

    const categoryError = await assertCategoriesBelongToEntity(
      body.categoryIds,
      scope.entityId,
    );

    if (categoryError) {
      res.status(400).json({ error: categoryError });
      return;
    }

    const seller = await prisma.seller.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        imageUrl: body.imageUrl,
        active: body.active,
        entityId: scope.entityId,
        primaryLocationId: body.primaryLocationId,
        categories: {
          connect: body.categoryIds.map((id) => ({ id })),
        },
        schedules: {
          create: body.schedules.map((item) => ({
            weekday: item.weekday,
            startTime: item.startTime,
            endTime: item.endTime,
            locationId: item.locationId,
          })),
        },
        exceptions: {
          create: exceptionRows(body.exceptions),
        },
      },
      include: sellerInclude,
    });

    res.status(201).json({ seller });
  } catch (error) {
    next(error);
  }
});

sellersRouter.put("/:id", async (req, res, next) => {
  try {
    const body = updateSellerSchema.parse(req.body);
    const existing = await prisma.seller.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ error: "Verkoper niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const locationError = await assertLocationsBelongToEntity(
      [
        body.primaryLocationId,
        ...body.schedules.map((item) => item.locationId),
        ...body.exceptions.flatMap((item) =>
          item.kind === "WORKING" && item.locationId ? [item.locationId] : [],
        ),
      ],
      existing.entityId,
    );

    if (locationError) {
      res.status(400).json({ error: locationError });
      return;
    }

    const categoryError = await assertCategoriesBelongToEntity(
      body.categoryIds,
      existing.entityId,
    );

    if (categoryError) {
      res.status(400).json({ error: categoryError });
      return;
    }

    const seller = await prisma.$transaction(async (tx) => {
      await tx.sellerSchedule.deleteMany({
        where: { sellerId: String(req.params.id) },
      });
      await tx.sellerScheduleException.deleteMany({
        where: { sellerId: String(req.params.id) },
      });

      return tx.seller.update({
        where: { id: String(req.params.id) },
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          imageUrl: body.imageUrl,
          active: body.active,
          primaryLocationId: body.primaryLocationId,
          categories: {
            set: body.categoryIds.map((id) => ({ id })),
          },
          schedules: {
            create: body.schedules.map((item) => ({
              weekday: item.weekday,
              startTime: item.startTime,
              endTime: item.endTime,
              locationId: item.locationId,
            })),
          },
          exceptions: {
            create: exceptionRows(body.exceptions),
          },
        },
        include: sellerInclude,
      });
    });

    res.json({ seller });
  } catch (error) {
    next(error);
  }
});

sellersRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.seller.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ error: "Verkoper niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.seller.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
