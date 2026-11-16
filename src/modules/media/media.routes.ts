import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  GLOBAL_MEDIA_ENTITY,
  ensureMediaDir,
  entityFilesDir,
  publicMediaUrl,
  sanitizeEntityKey,
} from "../../lib/media.js";

async function resolveAllowedEntityKey(req: {
  user?: Express.Request["user"];
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<{ entityKey: string } | { error: string; status: number }> {
  const requested =
    (typeof req.query.entity === "string" && req.query.entity) ||
    (req.body && typeof req.body.entity === "string" && req.body.entity) ||
    null;

  if (req.user?.role === "ADMIN") {
    if (req.user.entityIds.length === 0) {
      return { error: "Admin is niet gekoppeld aan een entiteit", status: 403 };
    }

    const entities = await prisma.entity.findMany({
      where: { id: { in: req.user.entityIds } },
      select: { slug: true },
    });

    if (entities.length === 0) {
      return { error: "Entity not found", status: 403 };
    }

    if (requested) {
      const key = sanitizeEntityKey(requested);
      const match = entities.find((entity) => entity.slug === key);
      if (!match) {
        return { error: "Forbidden for this entity media folder", status: 403 };
      }
      return { entityKey: match.slug };
    }

    if (entities.length === 1) {
      return { entityKey: entities[0]!.slug };
    }

    return { error: "Kies een entiteit voor de upload", status: 400 };
  }

  return {
    entityKey: sanitizeEntityKey(requested || GLOBAL_MEDIA_ENTITY),
  };
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    void (async () => {
      try {
        const resolved = await resolveAllowedEntityKey(req);
        if ("error" in resolved) {
          cb(new Error(resolved.error), "");
          return;
        }
        ensureMediaDir(resolved.entityKey);
        cb(null, entityFilesDir(resolved.entityKey));
      } catch (error) {
        cb(error as Error, "");
      }
    })();
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Alleen afbeeldingen zijn toegestaan"));
      return;
    }
    cb(null, true);
  },
});

export const mediaRouter = Router();

mediaRouter.use(requireAuth);

mediaRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }

    void (async () => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "Geen bestand ontvangen" });
          return;
        }

        const resolved = await resolveAllowedEntityKey(req);
        if ("error" in resolved) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }

        res.status(201).json({
          url: publicMediaUrl(resolved.entityKey, req.file.filename),
          entity: resolved.entityKey,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
        });
      } catch (error) {
        next(error);
      }
    })();
  });
});
