import { Prisma, type Role } from "@prisma/client";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthUser } from "../../types/express.js";
import { createUserSchema, updateUserSchema } from "./users.schemas.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

const entitySummarySelect = {
  id: true,
  name: true,
  slug: true,
  active: true,
} as const;

const userSelect = {
  id: true,
  email: true,
  role: true,
  lastLoggedInAt: true,
  createdAt: true,
  entities: {
    select: {
      entity: { select: entitySummarySelect },
    },
  },
} as const;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function presentUser(user: UserRecord, visibleEntityIds?: string[] | null) {
  const entities = user.entities
    .map((link) => link.entity)
    .filter(
      (entity) => !visibleEntityIds || visibleEntityIds.includes(entity.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    lastLoggedInAt: user.lastLoggedInAt,
    createdAt: user.createdAt,
    entities,
  };
}

async function existingEntityIds(entityIds: string[]) {
  const unique = [...new Set(entityIds)];
  if (unique.length === 0) return null;
  const count = await prisma.entity.count({
    where: { id: { in: unique } },
  });
  return count === unique.length ? unique : null;
}

function resolveCreatorEntityIds(
  current: AuthUser,
  requested?: string[] | null,
): { entityIds: string[] } | { error: string; status: number } {
  if (current.entityIds.length === 0) {
    return { error: "Admin is niet gekoppeld aan een entiteit", status: 403 };
  }

  const ids = requested?.length
    ? [...new Set(requested)]
    : current.entityIds.length === 1
      ? [...current.entityIds]
      : null;

  if (!ids || ids.length === 0) {
    return { error: "Kies minstens één entiteit", status: 400 };
  }

  if (ids.some((id) => !current.entityIds.includes(id))) {
    return { error: "Geen toegang tot deze entiteit", status: 403 };
  }

  return { entityIds: ids };
}

usersRouter.get("/", async (req, res, next) => {
  try {
    const current = req.user!;

    if (current.role === "SUPER_ADMIN") {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: userSelect,
      });

      res.json({ users: users.map((user) => presentUser(user)) });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        role: "ADMIN",
        entities: { some: { entityId: { in: current.entityIds } } },
      },
      orderBy: { createdAt: "desc" },
      select: userSelect,
    });

    res.json({
      users: users.map((user) => presentUser(user, current.entityIds)),
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const current = req.user!;
    const body = createUserSchema.parse(req.body);

    let role: Role;
    let entityIds: string[];

    if (current.role === "SUPER_ADMIN") {
      role = body.role ?? "ADMIN";
      if (role === "SUPER_ADMIN") {
        entityIds = [];
      } else {
        const unique = await existingEntityIds(body.entityIds ?? []);
        if (!unique) {
          res.status(400).json({
            error: "Kies minstens één bestaande entiteit",
          });
          return;
        }
        entityIds = unique;
      }
    } else if (current.role === "ADMIN") {
      role = "ADMIN";
      const scope = resolveCreatorEntityIds(current, body.entityIds);
      if ("error" in scope) {
        res.status(scope.status).json({ error: scope.error });
        return;
      }
      entityIds = scope.entityIds;
    } else {
      res.status(403).json({ error: "Geen rechten om gebruikers aan te maken" });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    try {
      const user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          passwordHash,
          role,
          entities: {
            create: entityIds.map((entityId) => ({ entityId })),
          },
        },
        select: userSelect,
      });

      res.status(201).json({
        user: presentUser(
          user,
          current.role === "SUPER_ADMIN" ? null : current.entityIds,
        ),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({ error: "Dit e-mailadres is al in gebruik" });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const current = req.user!;
    const id = String(req.params.id);
    const body = updateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!existing) {
      res.status(404).json({ error: "Gebruiker niet gevonden" });
      return;
    }

    if (current.role === "ADMIN") {
      if (body.password !== undefined || body.role !== undefined) {
        res.status(403).json({ error: "Geen rechten om dit te wijzigen" });
        return;
      }

      if (existing.role !== "ADMIN") {
        res.status(403).json({ error: "Geen rechten om deze gebruiker te wijzigen" });
        return;
      }

      const sharesEntity = existing.entities.some((link) =>
        current.entityIds.includes(link.entity.id),
      );
      if (!sharesEntity) {
        res.status(403).json({ error: "Geen toegang tot deze gebruiker" });
        return;
      }

      const requested = [...new Set(body.entityIds ?? [])];
      if (requested.length === 0) {
        res.status(400).json({ error: "Kies minstens één entiteit" });
        return;
      }
      if (requested.some((entityId) => !current.entityIds.includes(entityId))) {
        res.status(403).json({ error: "Geen toegang tot deze entiteit" });
        return;
      }

      await prisma.$transaction([
        prisma.userEntity.deleteMany({
          where: { userId: id, entityId: { in: current.entityIds } },
        }),
        prisma.userEntity.createMany({
          data: requested.map((entityId) => ({ userId: id, entityId })),
        }),
      ]);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id },
        select: userSelect,
      });
      res.json({ user: presentUser(user, current.entityIds) });
      return;
    }

    if (current.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "Geen rechten om gebruikers te wijzigen" });
      return;
    }

    const passwordHash =
      body.password !== undefined
        ? await bcrypt.hash(body.password, 12)
        : undefined;

    const touchesRoleOrEntities =
      body.role !== undefined || body.entityIds !== undefined;

    if (!touchesRoleOrEntities) {
      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id },
        select: userSelect,
      });
      res.json({ user: presentUser(user) });
      return;
    }

    if (body.role && body.role !== existing.role && id === current.id) {
      res.status(400).json({ error: "Je kunt je eigen rol niet wijzigen" });
      return;
    }

    const nextRole = body.role ?? existing.role;

    if (nextRole === "SUPER_ADMIN") {
      if (body.entityIds && body.entityIds.length > 0) {
        res.status(400).json({
          error: "Een super admin is aan alle entiteiten gekoppeld",
        });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id },
          data: {
            role: "SUPER_ADMIN",
            ...(passwordHash ? { passwordHash } : {}),
          },
        }),
        prisma.userEntity.deleteMany({ where: { userId: id } }),
      ]);
    } else {
      if (existing.role === "SUPER_ADMIN") {
        const superCount = await prisma.user.count({
          where: { role: "SUPER_ADMIN" },
        });
        if (superCount <= 1) {
          res.status(400).json({
            error: "Er moet minstens één super admin blijven",
          });
          return;
        }
      }

      const entityIds = body.entityIds
        ? [...new Set(body.entityIds)]
        : existing.entities.map((link) => link.entity.id);
      const unique = await existingEntityIds(entityIds);
      if (!unique) {
        res.status(400).json({ error: "Kies minstens één bestaande entiteit" });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id },
          data: {
            role: "ADMIN",
            ...(passwordHash ? { passwordHash } : {}),
          },
        }),
        prisma.userEntity.deleteMany({ where: { userId: id } }),
        prisma.userEntity.createMany({
          data: unique.map((entityId) => ({ userId: id, entityId })),
        }),
      ]);
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: userSelect,
    });
    res.json({ user: presentUser(user) });
  } catch (error) {
    next(error);
  }
});

usersRouter.delete("/:id", async (req, res, next) => {
  try {
    const current = req.user!;
    if (current.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "Geen rechten om gebruikers te verwijderen" });
      return;
    }

    const id = String(req.params.id);
    if (id === current.id) {
      res.status(400).json({ error: "Je kunt jezelf niet verwijderen" });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Gebruiker niet gevonden" });
      return;
    }

    if (existing.role === "SUPER_ADMIN") {
      const superCount = await prisma.user.count({
        where: { role: "SUPER_ADMIN" },
      });
      if (superCount <= 1) {
        res.status(400).json({
          error: "Er moet minstens één super admin blijven",
        });
        return;
      }
    }

    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
