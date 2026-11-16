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
  createLocationSchema,
  updateLocationSchema,
} from "./locations.schemas.js";

export const locationsRouter = Router();

locationsRouter.use(requireAuth);

locationsRouter.get("/", async (req, res, next) => {
  try {
    const filter = resolveEntityFilter(
      req.user!,
      typeof req.query.entityId === "string" ? req.query.entityId : null,
    );

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    const locations = await prisma.location.findMany({
      where: prismaEntityWhere(filter),
      orderBy: { name: "asc" },
      include: {
        entity: { select: { id: true, name: true, slug: true } },
      },
    });

    res.json({ locations });
  } catch (error) {
    next(error);
  }
});

locationsRouter.get("/:id", async (req, res, next) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: {
        entity: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!location) {
      res.status(404).json({ error: "Locatie niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, location.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ location });
  } catch (error) {
    next(error);
  }
});

locationsRouter.post("/", async (req, res, next) => {
  try {
    const body = createLocationSchema.parse(req.body);
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

    const location = await prisma.location.create({
      data: {
        name: body.name,
        imageUrl: body.imageUrl ?? null,
        address: body.address,
        googleMapsUrl: body.googleMapsUrl,
        phone: body.phone,
        email: body.email,
        permalink: body.permalink,
        entityId: scope.entityId,
      },
      include: {
        entity: { select: { id: true, name: true, slug: true } },
      },
    });

    res.status(201).json({ location });
  } catch (error) {
    next(error);
  }
});

locationsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateLocationSchema.parse(req.body);
    const existing = await prisma.location.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ error: "Locatie niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: body,
      include: {
        entity: { select: { id: true, name: true, slug: true } },
      },
    });

    res.json({ location });
  } catch (error) {
    next(error);
  }
});

locationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.location.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ error: "Locatie niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.location.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
