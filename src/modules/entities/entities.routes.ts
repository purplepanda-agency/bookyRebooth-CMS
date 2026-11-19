import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { domainInUseError } from "../../lib/domainAvailability.js";
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
    const domain = body.domain ? body.domain : null;
    const domainError = await domainInUseError(domain);
    if (domainError) {
      res.status(409).json({ error: domainError });
      return;
    }

    const entity = await prisma.entity.create({
      data: {
        name: body.name,
        slug: body.slug,
        domain,
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
    const entityId = String(req.params.id);

    if (body.domain) {
      const domainError = await domainInUseError(body.domain, entityId);
      if (domainError) {
        res.status(409).json({ error: domainError });
        return;
      }
    }

    const entity = await prisma.entity.update({
      where: { id: entityId },
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
