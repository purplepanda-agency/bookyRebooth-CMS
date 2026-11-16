import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { createEntitySchema, updateEntitySchema } from "./entities.schemas.js";

export const entitiesRouter = Router();

entitiesRouter.use(requireAuth, requireRole("SUPER_ADMIN"));

entitiesRouter.get("/", async (_req, res, next) => {
  try {
    const entities = await prisma.entity.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true } },
      },
    });

    res.json({ entities });
  } catch (error) {
    next(error);
  }
});

entitiesRouter.get("/:id", async (req, res, next) => {
  try {
    const entity = await prisma.entity.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }

    res.json({
      entity: {
        ...entity,
        users: entity.users.map((link) => link.user),
      },
    });
  } catch (error) {
    next(error);
  }
});

entitiesRouter.post("/", async (req, res, next) => {
  try {
    const body = createEntitySchema.parse(req.body);

    const entity = await prisma.entity.create({
      data: {
        name: body.name,
        slug: body.slug,
        domain: body.domain ? body.domain : null,
        active: body.active,
        maintenanceMode: body.maintenanceMode,
      },
    });

    res.status(201).json({ entity });
  } catch (error) {
    next(error);
  }
});

entitiesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateEntitySchema.parse(req.body);

    const entity = await prisma.entity.update({
      where: { id: String(req.params.id) },
      data: {
        ...body,
        ...(body.domain !== undefined
          ? { domain: body.domain ? body.domain : null }
          : {}),
      },
    });

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});
