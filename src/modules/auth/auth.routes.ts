import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import { changePasswordSchema, loginSchema } from "./auth.schemas.js";

export const authRouter = Router();

const entitySummarySelect = {
  id: true,
  name: true,
  slug: true,
  active: true,
} as const;

const userWithEntities = {
  entities: {
    select: {
      entity: { select: entitySummarySelect },
    },
  },
} as const;

function publicEntities(
  role: "SUPER_ADMIN" | "ADMIN",
  links: Array<{ entity: { id: string; name: string; slug: string; active: boolean } }>,
) {
  if (role === "SUPER_ADMIN") return [];
  return links
    .map((link) => link.entity)
    .filter((entity) => entity.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: userWithEntities,
    });

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const entities = publicEntities(user.role, user.entities);
    if (user.role === "ADMIN" && entities.length === 0) {
      res.status(403).json({ error: "Geen actieve entiteit toegewezen" });
      return;
    }

    const lastLoggedInAt = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoggedInAt },
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as SignOptions,
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        entities,
        lastLoggedInAt: lastLoggedInAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        ...userWithEntities,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        entities: publicEntities(user.role, user.entities),
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const body = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Huidig wachtwoord is onjuist" });
      return;
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
