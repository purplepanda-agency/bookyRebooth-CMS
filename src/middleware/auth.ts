import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { AuthUser } from "../types/express.js";

type JwtPayload = {
  id?: string;
  iat?: number;
  exp?: number;
};

const entityLinkSelect = {
  entity: {
    select: { id: true, active: true },
  },
} as const;

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (!payload.id) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  void (async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          role: true,
          entities: { select: entityLinkSelect },
        },
      });

      if (!user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      const entityIds =
        user.role === "SUPER_ADMIN"
          ? []
          : user.entities
              .filter((link) => link.entity.active)
              .map((link) => link.entity.id);

      if (user.role === "ADMIN" && entityIds.length === 0) {
        res.status(403).json({ error: "Geen actieve entiteit toegewezen" });
        return;
      }

      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        entityIds,
      };

      req.user = authUser;
      next();
    } catch (error) {
      next(error);
    }
  })();
};
