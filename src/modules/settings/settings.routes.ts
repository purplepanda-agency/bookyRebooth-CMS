import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { resolveEntityIdForWrite } from "../../lib/entityScope.js";
import {
  calendarSelect,
  toPublicCalendarConfig,
} from "../../lib/calendar/resolve.js";
import { encryptSecret } from "../../lib/secretCrypto.js";
import { domainInUseError } from "../../lib/domainAvailability.js";
import {
  updateCalendarSettingsSchema,
  updateContentSettingsSchema,
  updateDomainSettingsSchema,
  updateTrackingSettingsSchema,
} from "./settings.schemas.js";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

const entitySettingsSelect = {
  id: true,
  name: true,
  slug: true,
  domain: true,
  logoUrl: true,
  introText: true,
  emailExtraTxt: true,
  primaryColor: true,
  secondaryColor: true,
  accentColor: true,
  gtmId: true,
  headerScripts: true,
  footerScripts: true,
  active: true,
  maintenanceMode: true,
} as const;

settingsRouter.get("/domain", async (req, res, next) => {
  try {
    const queryEntityId =
      typeof req.query.entityId === "string" ? req.query.entityId : null;
    const scope = resolveEntityIdForWrite(req.user!, queryEntityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id: scope.entityId },
      select: entitySettingsSelect,
    });

    if (!entity) {
      res.status(404).json({ error: "Entiteit niet gevonden" });
      return;
    }

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/domain", async (req, res, next) => {
  try {
    const body = updateDomainSettingsSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const domain = body.domain ? body.domain : null;
    const domainError = await domainInUseError(domain, scope.entityId);
    if (domainError) {
      res.status(409).json({ error: domainError });
      return;
    }

    const entity = await prisma.entity.update({
      where: { id: scope.entityId },
      data: {
        domain,
        maintenanceMode: body.maintenanceMode,
      },
      select: entitySettingsSelect,
    });

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/content", async (req, res, next) => {
  try {
    const queryEntityId =
      typeof req.query.entityId === "string" ? req.query.entityId : null;
    const scope = resolveEntityIdForWrite(req.user!, queryEntityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id: scope.entityId },
      select: entitySettingsSelect,
    });

    if (!entity) {
      res.status(404).json({ error: "Entiteit niet gevonden" });
      return;
    }

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/content", async (req, res, next) => {
  try {
    const body = updateContentSettingsSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.update({
      where: { id: scope.entityId },
      data: {
        logoUrl: body.logoUrl,
        introText: body.introText?.trim() ? body.introText.trim() : null,
        emailExtraTxt: body.emailExtraTxt?.trim()
          ? body.emailExtraTxt
          : null,
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor,
        accentColor: body.accentColor,
      },
      select: entitySettingsSelect,
    });

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/tracking", async (req, res, next) => {
  try {
    const queryEntityId =
      typeof req.query.entityId === "string" ? req.query.entityId : null;
    const scope = resolveEntityIdForWrite(req.user!, queryEntityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id: scope.entityId },
      select: {
        id: true,
        name: true,
        slug: true,
        gtmId: true,
        headerScripts: true,
        footerScripts: true,
      },
    });

    if (!entity) {
      res.status(404).json({ error: "Entiteit niet gevonden" });
      return;
    }

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/tracking", async (req, res, next) => {
  try {
    const body = updateTrackingSettingsSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.update({
      where: { id: scope.entityId },
      data: {
        gtmId: body.gtmId,
        headerScripts: body.headerScripts?.trim()
          ? body.headerScripts
          : null,
        footerScripts: body.footerScripts?.trim()
          ? body.footerScripts
          : null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        gtmId: true,
        headerScripts: true,
        footerScripts: true,
      },
    });

    res.json({ entity });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/calendar", async (req, res, next) => {
  try {
    const queryEntityId =
      typeof req.query.entityId === "string" ? req.query.entityId : null;
    const scope = resolveEntityIdForWrite(req.user!, queryEntityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id: scope.entityId },
      select: {
        name: true,
        slug: true,
        ...calendarSelect,
      },
    });

    if (!entity) {
      res.status(404).json({ error: "Entiteit niet gevonden" });
      return;
    }

    res.json({
      entity: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        calendar: toPublicCalendarConfig(entity),
      },
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/calendar", async (req, res, next) => {
  try {
    const body = updateCalendarSettingsSchema.parse(req.body);
    const scope = resolveEntityIdForWrite(req.user!, body.entityId);

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const existing = await prisma.entity.findUnique({
      where: { id: scope.entityId },
      select: calendarSelect,
    });

    if (!existing) {
      res.status(404).json({ error: "Entiteit niet gevonden" });
      return;
    }

    let outlookClientSecretEnc = existing.outlookClientSecretEnc;
    if (body.clearOutlookClientSecret) {
      outlookClientSecretEnc = null;
    } else if (body.outlookClientSecret) {
      outlookClientSecretEnc = encryptSecret(body.outlookClientSecret);
    }

    let googleOAuthClientSecretEnc = existing.googleOAuthClientSecretEnc;
    if (body.clearGoogleOAuthClientSecret) {
      googleOAuthClientSecretEnc = null;
    } else if (body.googleOAuthClientSecret) {
      googleOAuthClientSecretEnc = encryptSecret(body.googleOAuthClientSecret);
    }

    if (body.provider === "OUTLOOK" && !outlookClientSecretEnc) {
      res.status(400).json({
        error: "Outlook client secret is verplicht (of behoud de bestaande).",
      });
      return;
    }

    if (body.provider === "GOOGLE" && !googleOAuthClientSecretEnc) {
      res.status(400).json({
        error: "Google client secret is verplicht (of behoud de bestaande).",
      });
      return;
    }

    const entity = await prisma.entity.update({
      where: { id: scope.entityId },
      data: {
        calendarProvider: body.provider,
        calendarTimezone: body.timeZone,
        outlookTenantId:
          body.provider === "OUTLOOK" ? body.outlookTenantId : null,
        outlookClientId:
          body.provider === "OUTLOOK" ? body.outlookClientId : null,
        outlookClientSecretEnc:
          body.provider === "OUTLOOK" ? outlookClientSecretEnc : null,
        googleOAuthClientId:
          body.provider === "GOOGLE" ? body.googleOAuthClientId : null,
        googleOAuthClientSecretEnc:
          body.provider === "GOOGLE" ? googleOAuthClientSecretEnc : null,
        // Legacy service-account fields unused for per-seller OAuth.
        googleClientEmail: null,
        googlePrivateKeyEnc: null,
        googleSubject: null,
      },
      select: {
        name: true,
        slug: true,
        ...calendarSelect,
      },
    });

    res.json({
      entity: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        calendar: toPublicCalendarConfig(entity),
      },
    });
  } catch (error) {
    next(error);
  }
});
