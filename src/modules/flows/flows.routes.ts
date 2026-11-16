import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  canAccessEntity,
  prismaEntityWhere,
  resolveEntityFilter,
  resolveEntityIdForWrite,
} from "../../lib/entityScope.js";
import {
  createFlowSchema,
  patchFlowActiveSchema,
  reorderFlowsSchema,
  updateFlowSchema,
} from "./flows.schemas.js";

export const flowsRouter = Router();

flowsRouter.use(requireAuth);

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueFlowSlug(
  entityId: string,
  baseSlug: string,
  excludeId?: string,
) {
  let candidate = baseSlug || `flow-${Date.now().toString(36)}`;
  let suffix = 2;

  while (true) {
    const existing = await prisma.flow.findFirst({
      where: {
        entityId,
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

const stepInclude = {
  steps: {
    orderBy: { sortOrder: "asc" as const },
  },
  entity: {
    select: { id: true, name: true, slug: true },
  },
};

async function validateSteps(
  steps: Array<{
    type: string;
    config: Record<string, unknown>;
  }>,
  entityId: string,
): Promise<string | null> {
  for (const step of steps) {
    if (step.type === "PRODUCT_SET") {
      const productSetId = step.config.productSetId;
      if (typeof productSetId !== "string") {
        return "Ongeldige product set";
      }
      const exists = await prisma.productSet.findFirst({
        where: {
          id: productSetId,
          entities: { some: { id: entityId } },
        },
        select: { id: true },
      });
      if (!exists) {
        return "Product set bestaat niet of is niet beschikbaar voor deze entiteit";
      }
    }

    if (step.type === "LOCATIONS") {
      const locationIds = step.config.locationIds;
      if (!Array.isArray(locationIds)) {
        return "Ongeldige locaties";
      }
      const uniqueIds = [...new Set(locationIds.map(String))];
      const count = await prisma.location.count({
        where: {
          id: { in: uniqueIds },
          entityId,
        },
      });
      if (count !== uniqueIds.length) {
        return "Een of meer locaties horen niet bij deze entiteit";
      }
    }

    if (step.type === "CATEGORIES") {
      const categoryIds = step.config.categoryIds;
      if (!Array.isArray(categoryIds)) {
        return "Ongeldige categorieën";
      }
      const uniqueIds = [...new Set(categoryIds.map(String))];
      const count = await prisma.category.count({
        where: {
          id: { in: uniqueIds },
          entityId,
        },
      });
      if (count !== uniqueIds.length) {
        return "Een of meer categorieën horen niet bij deze entiteit";
      }
    }
  }

  return null;
}

flowsRouter.get("/", async (req, res, next) => {
  try {
    const filter = resolveEntityFilter(
      req.user!,
      typeof req.query.entityId === "string" ? req.query.entityId : null,
    );

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    const flows = await prisma.flow.findMany({
      where: prismaEntityWhere(filter),
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
        { name: "asc" },
      ],
      include: {
        entity: { select: { id: true, name: true, slug: true } },
        _count: { select: { steps: true } },
      },
    });

    res.json({ flows });
  } catch (error) {
    next(error);
  }
});

flowsRouter.put("/reorder", async (req, res, next) => {
  try {
    const body = reorderFlowsSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const existing = await prisma.flow.findMany({
      where: {
        entityId: scope.entityId,
        id: { in: body.orderedIds },
      },
      select: { id: true },
    });

    if (existing.length !== body.orderedIds.length) {
      res.status(400).json({
        error: "Een of meer flows horen niet bij deze entiteit",
      });
      return;
    }

    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.flow.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const flows = await prisma.flow.findMany({
      where: { entityId: scope.entityId },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
        { name: "asc" },
      ],
      include: {
        entity: { select: { id: true, name: true, slug: true } },
        _count: { select: { steps: true } },
      },
    });

    res.json({ flows });
  } catch (error) {
    next(error);
  }
});

flowsRouter.get("/:id", async (req, res, next) => {
  try {
    const flow = await prisma.flow.findUnique({
      where: { id: String(req.params.id) },
      include: stepInclude,
    });

    if (!flow) {
      res.status(404).json({ error: "Flow niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, flow.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ flow });
  } catch (error) {
    next(error);
  }
});

flowsRouter.post("/", async (req, res, next) => {
  try {
    const body = createFlowSchema.parse(req.body);
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

    const validationError = await validateSteps(body.steps, scope.entityId);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const baseSlug =
      body.slug ||
      slugify(body.name) ||
      `flow-${Date.now().toString(36)}`;
    const slug = await uniqueFlowSlug(scope.entityId, baseSlug);

    const maxSort = await prisma.flow.aggregate({
      where: { entityId: scope.entityId },
      _max: { sortOrder: true },
    });
    const nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const flow = await prisma.flow.create({
      data: {
        name: body.name,
        slug,
        featuredImage: body.featuredImage ?? null,
        active: body.active,
        sortOrder: nextSortOrder,
        entityId: scope.entityId,
        steps: {
          create: body.steps.map((step, index) => ({
            type: step.type,
            sortOrder: index,
            config: step.config,
          })),
        },
      },
      include: stepInclude,
    });

    res.status(201).json({ flow });
  } catch (error) {
    next(error);
  }
});

flowsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const body = updateFlowSchema.parse(req.body);

    const existing = await prisma.flow.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Flow niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const validationError = await validateSteps(body.steps, existing.entityId);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const slugTaken = await prisma.flow.findFirst({
      where: {
        entityId: existing.entityId,
        slug: body.slug,
        id: { not: id },
      },
      select: { id: true },
    });
    if (slugTaken) {
      res.status(400).json({ error: "Deze slug bestaat al binnen de entiteit" });
      return;
    }

    const existingSteps = await prisma.flowStep.findMany({
      where: { flowId: id },
      select: { id: true },
    });
    const existingStepIds = new Set(existingSteps.map((step) => step.id));
    const incomingIds = body.steps
      .map((step) => step.id)
      .filter((stepId): stepId is string => Boolean(stepId));

    if (incomingIds.some((stepId) => !existingStepIds.has(stepId))) {
      res.status(400).json({
        error: "Een of meer stappen horen niet bij deze flow",
      });
      return;
    }

    if (new Set(incomingIds).size !== incomingIds.length) {
      res.status(400).json({ error: "Dubbele stap-id's in de payload" });
      return;
    }

    const flow = await prisma.$transaction(async (tx) => {
      await tx.flowStep.deleteMany({
        where: {
          flowId: id,
          ...(incomingIds.length > 0
            ? { id: { notIn: incomingIds } }
            : {}),
        },
      });

      for (const [index, step] of body.steps.entries()) {
        if (step.id) {
          await tx.flowStep.update({
            where: { id: step.id },
            data: {
              type: step.type,
              sortOrder: index,
              config: step.config,
            },
          });
        } else {
          await tx.flowStep.create({
            data: {
              flowId: id,
              type: step.type,
              sortOrder: index,
              config: step.config,
            },
          });
        }
      }

      return tx.flow.update({
        where: { id },
        data: {
          name: body.name,
          slug: body.slug,
          featuredImage: body.featuredImage ?? null,
          active: body.active,
        },
        include: stepInclude,
      });
    });

    res.json({ flow });
  } catch (error) {
    next(error);
  }
});

flowsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const body = patchFlowActiveSchema.parse(req.body);

    const existing = await prisma.flow.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Flow niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const flow = await prisma.flow.update({
      where: { id },
      data: { active: body.active },
      include: {
        entity: { select: { id: true, name: true, slug: true } },
        _count: { select: { steps: true } },
      },
    });

    res.json({ flow });
  } catch (error) {
    next(error);
  }
});

flowsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.flow.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: "Flow niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.flow.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
