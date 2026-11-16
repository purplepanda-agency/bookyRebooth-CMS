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
  createContentBlockSchema,
  updateContentBlockSchema,
} from "./contentBlocks.schemas.js";

export const contentBlocksRouter = Router();

contentBlocksRouter.use(requireAuth);

const contentBlockInclude = {
  steps: {
    select: {
      flowStep: {
        select: {
          id: true,
          type: true,
          sortOrder: true,
          config: true,
          flow: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
  entity: { select: { id: true, name: true, slug: true } },
} as const;

type ContentBlockRow = {
  id: string;
  title: string;
  text: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  active: boolean;
  sortOrder: number;
  entityId: string;
  entity: { id: string; name: string; slug: string };
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    flowStep: {
      id: string;
      type: string;
      sortOrder: number;
      config: unknown;
      flow: { id: string; name: string; slug: string };
    };
  }>;
};

function stepConfigTitle(config: unknown) {
  if (
    typeof config === "object" &&
    config &&
    "title" in config &&
    typeof (config as { title?: unknown }).title === "string"
  ) {
    return (config as { title: string }).title;
  }
  return null;
}

function mapContentBlock(block: ContentBlockRow) {
  return {
    id: block.id,
    title: block.title,
    text: block.text,
    buttonLabel: block.buttonLabel,
    buttonUrl: block.buttonUrl,
    active: block.active,
    sortOrder: block.sortOrder,
    entityId: block.entityId,
    entity: block.entity,
    steps: block.steps.map((link) => ({
      id: link.flowStep.id,
      type: link.flowStep.type,
      sortOrder: link.flowStep.sortOrder,
      title: stepConfigTitle(link.flowStep.config),
      flow: link.flowStep.flow,
    })),
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}

async function assertStepsForEntity(stepIds: string[], entityId: string) {
  if (stepIds.length === 0) return null;
  const uniqueIds = [...new Set(stepIds)];
  const count = await prisma.flowStep.count({
    where: {
      id: { in: uniqueIds },
      flow: { entityId },
    },
  });
  if (count !== uniqueIds.length) {
    return "Een of meer stappen horen niet bij deze entiteit";
  }
  return null;
}

contentBlocksRouter.get("/", async (req, res, next) => {
  try {
    const filter = resolveEntityFilter(
      req.user!,
      typeof req.query.entityId === "string" ? req.query.entityId : null,
    );

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    const blocks = await prisma.contentBlock.findMany({
      where: prismaEntityWhere(filter),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: contentBlockInclude,
    });

    res.json({
      contentBlocks: blocks.map((block) => mapContentBlock(block)),
    });
  } catch (error) {
    next(error);
  }
});

contentBlocksRouter.get("/step-options", async (req, res, next) => {
  try {
    const filter = resolveEntityFilter(
      req.user!,
      typeof req.query.entityId === "string" ? req.query.entityId : null,
    );

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    if (!filter.entityId) {
      res.status(400).json({ error: "entityId is verplicht" });
      return;
    }

    const flows = await prisma.flow.findMany({
      where: { entityId: filter.entityId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        steps: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            type: true,
            sortOrder: true,
            config: true,
          },
        },
      },
    });

    const options = flows.flatMap((flow) =>
      flow.steps.map((step) => {
        const configTitle =
          typeof step.config === "object" &&
          step.config &&
          "title" in step.config &&
          typeof (step.config as { title?: unknown }).title === "string"
            ? (step.config as { title: string }).title.trim()
            : "";
        return {
          id: step.id,
          type: step.type,
          sortOrder: step.sortOrder,
          flowId: flow.id,
          flowName: flow.name,
          label: `${flow.name} · Stap ${step.sortOrder + 1} (${stepTypeLabel(step.type)}${configTitle ? `: ${configTitle}` : ""})`,
        };
      }),
    );

    res.json({ options });
  } catch (error) {
    next(error);
  }
});

function stepTypeLabel(type: string) {
  switch (type) {
    case "FREE_CHOICE":
      return "Vrije keuze";
    case "PRODUCT_SET":
      return "Product set";
    case "LOCATIONS":
      return "Locaties";
    case "CATEGORIES":
      return "Categorieën";
    case "SELLERS_AGENDA":
      return "Agenda";
    case "CONFIRMATION":
      return "Bevestiging";
    default:
      return type;
  }
}

contentBlocksRouter.post("/", async (req, res, next) => {
  try {
    const body = createContentBlockSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const stepError = await assertStepsForEntity(body.stepIds, scope.entityId);
    if (stepError) {
      res.status(400).json({ error: stepError });
      return;
    }

    const maxSort = await prisma.contentBlock.aggregate({
      where: { entityId: scope.entityId },
      _max: { sortOrder: true },
    });

    const block = await prisma.contentBlock.create({
      data: {
        title: body.title,
        text: body.text,
        buttonLabel: body.buttonLabel,
        buttonUrl: body.buttonUrl,
        active: body.active,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        entityId: scope.entityId,
        steps: {
          create: [...new Set(body.stepIds)].map((flowStepId) => ({
            flowStepId,
          })),
        },
      },
      include: contentBlockInclude,
    });

    res.status(201).json({ contentBlock: mapContentBlock(block) });
  } catch (error) {
    next(error);
  }
});

contentBlocksRouter.put("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const body = updateContentBlockSchema.parse(req.body);

    const existing = await prisma.contentBlock.findUnique({
      where: { id },
      select: { id: true, entityId: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Contentblok niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const stepError = await assertStepsForEntity(
      body.stepIds,
      existing.entityId,
    );
    if (stepError) {
      res.status(400).json({ error: stepError });
      return;
    }

    const block = await prisma.$transaction(async (tx) => {
      await tx.contentBlockStep.deleteMany({
        where: { contentBlockId: id },
      });
      return tx.contentBlock.update({
        where: { id },
        data: {
          title: body.title,
          text: body.text,
          buttonLabel: body.buttonLabel,
          buttonUrl: body.buttonUrl,
          active: body.active,
          steps: {
            create: [...new Set(body.stepIds)].map((flowStepId) => ({
              flowStepId,
            })),
          },
        },
        include: contentBlockInclude,
      });
    });

    res.json({ contentBlock: mapContentBlock(block) });
  } catch (error) {
    next(error);
  }
});

contentBlocksRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.contentBlock.findUnique({
      where: { id },
      select: { id: true, entityId: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Contentblok niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.contentBlock.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
