import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { canAccessEntity } from "../../lib/entityScope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  createProductSetSchema,
  updateProductSetSchema,
} from "./productSets.schemas.js";

export const productSetsRouter = Router();

productSetsRouter.use(requireAuth);

const productInclude = {
  products: {
    orderBy: { sortOrder: "asc" as const },
  },
  entities: {
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" as const },
  },
};

async function assertEntitiesExist(entityIds: string[]) {
  if (entityIds.length === 0) return true;
  const unique = [...new Set(entityIds)];
  const count = await prisma.entity.count({
    where: { id: { in: unique } },
  });
  return count === unique.length;
}

productSetsRouter.get("/", async (req, res, next) => {
  try {
    const current = req.user!;
    const queryEntityId =
      typeof req.query.entityId === "string" && req.query.entityId.trim()
        ? req.query.entityId.trim()
        : null;

    let where:
      | { entities: { some: { id: string | { in: string[] } } } }
      | undefined;

    if (current.role === "SUPER_ADMIN") {
      if (queryEntityId) {
        where = { entities: { some: { id: queryEntityId } } };
      }
    } else {
      if (current.entityIds.length === 0) {
        res.status(403).json({ error: "Admin is niet gekoppeld aan een entiteit" });
        return;
      }
      if (queryEntityId && !current.entityIds.includes(queryEntityId)) {
        res.status(403).json({ error: "Geen toegang tot deze entiteit" });
        return;
      }
      where = {
        entities: {
          some: {
            id: queryEntityId ? queryEntityId : { in: current.entityIds },
          },
        },
      };
    }

    const productSets = await prisma.productSet.findMany({
      where,
      orderBy: { name: "asc" },
      include: productInclude,
    });
    res.json({ productSets });
  } catch (error) {
    next(error);
  }
});

productSetsRouter.get("/:id", async (req, res, next) => {
  try {
    const current = req.user!;
    const productSet = await prisma.productSet.findUnique({
      where: { id: req.params.id },
      include: productInclude,
    });

    if (!productSet) {
      res.status(404).json({ error: "Product set niet gevonden" });
      return;
    }

    if (
      current.role !== "SUPER_ADMIN" &&
      !productSet.entities.some((entity) => canAccessEntity(current, entity.id))
    ) {
      res.status(404).json({ error: "Product set niet gevonden" });
      return;
    }

    res.json({ productSet });
  } catch (error) {
    next(error);
  }
});

productSetsRouter.post("/", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const body = createProductSetSchema.parse(req.body);
    const entityIds = [...new Set(body.entityIds)];

    if (!(await assertEntitiesExist(entityIds))) {
      res.status(400).json({ error: "Een of meer entiteiten bestaan niet" });
      return;
    }

    const productSet = await prisma.productSet.create({
      data: {
        name: body.name,
        products: {
          create: body.products.map((product, index) => ({
            name: product.name,
            photoUrl: product.photoUrl,
            sortOrder: index,
          })),
        },
        entities: {
          connect: entityIds.map((id) => ({ id })),
        },
      },
      include: productInclude,
    });

    res.status(201).json({ productSet });
  } catch (error) {
    next(error);
  }
});

productSetsRouter.put(
  "/:id",
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const body = updateProductSetSchema.parse(req.body);
      const entityIds = [...new Set(body.entityIds)];

      const existing = await prisma.productSet.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({ error: "Product set niet gevonden" });
        return;
      }

      if (!(await assertEntitiesExist(entityIds))) {
        res.status(400).json({ error: "Een of meer entiteiten bestaan niet" });
        return;
      }

      const productSet = await prisma.$transaction(async (tx) => {
        await tx.productSetItem.deleteMany({
          where: { productSetId: id },
        });

        return tx.productSet.update({
          where: { id },
          data: {
            name: body.name,
            products: {
              create: body.products.map((product, index) => ({
                name: product.name,
                photoUrl: product.photoUrl,
                sortOrder: index,
              })),
            },
            entities: {
              set: entityIds.map((entityId) => ({ id: entityId })),
            },
          },
          include: productInclude,
        });
      });

      res.json({ productSet });
    } catch (error) {
      next(error);
    }
  },
);

productSetsRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      await prisma.productSet.delete({ where: { id: String(req.params.id) } });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
