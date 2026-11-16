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
  createCategorySchema,
  updateCategorySchema,
} from "./categories.schemas.js";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

const categoryInclude = {
  entity: { select: { id: true, name: true, slug: true } },
};

categoriesRouter.get("/", async (req, res, next) => {
  try {
    const filter = resolveEntityFilter(
      req.user!,
      typeof req.query.entityId === "string" ? req.query.entityId : null,
    );

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    const categories = await prisma.category.findMany({
      where: prismaEntityWhere(filter),
      orderBy: { name: "asc" },
      include: categoryInclude,
    });

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.get("/:id", async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: String(req.params.id) },
      include: categoryInclude,
    });

    if (!category) {
      res.status(404).json({ error: "Categorie niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, category.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ category });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.post("/", async (req, res, next) => {
  try {
    const body = createCategorySchema.parse(req.body);
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

    const category = await prisma.category.create({
      data: {
        name: body.name,
        imageUrl: body.imageUrl ?? null,
        slug: body.slug,
        entityId: scope.entityId,
      },
      include: categoryInclude,
    });

    res.status(201).json({ category });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const body = updateCategorySchema.parse(req.body);
    const existing = await prisma.category.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: "Categorie niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const category = await prisma.category.update({
      where: { id },
      data: body,
      include: categoryInclude,
    });

    res.json({ category });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.category.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: "Categorie niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, existing.entityId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.category.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
