import { Router } from "express";
import { ZodError } from "zod";
import { prisma } from "../../lib/prisma.js";
import { trackEvent } from "../../lib/analytics.js";
import { assertHostAllowed } from "../../lib/domain.js";
import { uniqueSlug } from "../../lib/slugify.js";
import {
  isRecaptchaConfigured,
  verifyRecaptchaToken,
} from "../../lib/recaptcha.js";
import { getAvailabilitySlots } from "../availability/availability.service.js";
import { createBooking } from "../bookings/bookings.service.js";
import {
  publicAvailabilitySlotsSchema,
  publicCreateBookingSchema,
  publicTrackEventSchema,
} from "./public.schemas.js";

export const publicRouter = Router();

type PublicOption = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  address?: string | null;
};

function resolveStepTitle(configRaw: unknown) {
  const config = asRecord(configRaw);
  return typeof config.title === "string" && config.title.trim()
    ? config.title.trim()
    : null;
}

function resolveImageFit(configRaw: unknown): "contain" | "cover" {
  const config = asRecord(configRaw);
  return config.imageFit === "cover" ? "cover" : "contain";
}

function hostFromRequest(req: {
  query: Record<string, unknown>;
  get: (name: string) => string | undefined;
}) {
  if (typeof req.query.host === "string" && req.query.host.trim()) {
    return req.query.host;
  }
  const origin = req.get("origin");
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  }
  return req.get("x-forwarded-host") || req.get("host") || null;
}

type PublicEntityScope =
  | {
      entity: {
        id: string;
        name: string;
        slug: string;
        domain: string | null;
        active: boolean;
        maintenanceMode: boolean;
      };
    }
  | { error: string; status: 403 | 404 | 503 };

async function resolvePublicEntity(
  entitySlug: string,
  host: string | null,
): Promise<PublicEntityScope> {
  const entity = await prisma.entity.findUnique({
    where: { slug: entitySlug },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      active: true,
      maintenanceMode: true,
    },
  });

  if (!entity || !entity.active) {
    return { error: "Entiteit niet gevonden", status: 404 };
  }

  const domainError = assertHostAllowed(entity.domain, host);
  if (domainError) {
    return { error: domainError, status: 403 };
  }

  if (entity.maintenanceMode) {
    return {
      error: "Deze booking tool is tijdelijk in onderhoud.",
      status: 503,
    };
  }

  return { entity };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveStepOptions(
  type: string,
  configRaw: unknown,
  entityId: string,
): Promise<PublicOption[]> {
  const config = asRecord(configRaw);

  if (type === "FREE_CHOICE") {
    const options = Array.isArray(config.options) ? config.options : [];
    return options.flatMap((option, index) => {
      if (!option || typeof option !== "object") return [];
      const row = option as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name : "";
      const slug = typeof row.slug === "string" ? row.slug : "";
      if (!name || !slug) return [];
      return [
        {
          id: `free-${index}-${slug}`,
          name,
          slug,
          imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null,
        },
      ];
    });
  }

  if (type === "CATEGORIES") {
    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.map(String)
      : [];
    if (categoryIds.length === 0) return [];
    const categories = await prisma.category.findMany({
      where: { entityId, id: { in: categoryIds } },
      select: { id: true, name: true, slug: true, imageUrl: true },
    });
    const byId = new Map(categories.map((item) => [item.id, item]));
    const showImage = config.showImage !== false;
    return categoryIds.flatMap((id) => {
      const category = byId.get(id);
      if (!category) return [];
      return [
        {
          id: category.id,
          name: category.name,
          slug: category.slug,
          imageUrl: showImage ? category.imageUrl : null,
        },
      ];
    });
  }

  if (type === "LOCATIONS") {
    const locationIds = Array.isArray(config.locationIds)
      ? config.locationIds.map(String)
      : [];
    if (locationIds.length === 0) return [];
    const locations = await prisma.location.findMany({
      where: { entityId, id: { in: locationIds } },
      select: {
        id: true,
        name: true,
        permalink: true,
        imageUrl: true,
        address: true,
      },
    });
    const byId = new Map(locations.map((item) => [item.id, item]));
    const showImage = config.showImage !== false;
    return locationIds.flatMap((id) => {
      const location = byId.get(id);
      if (!location) return [];
      return [
        {
          id: location.id,
          name: location.name,
          slug: location.permalink,
          imageUrl: showImage ? location.imageUrl : null,
          address: location.address,
        },
      ];
    });
  }

  if (type === "PRODUCT_SET") {
    const productSetId =
      typeof config.productSetId === "string" ? config.productSetId : null;
    if (!productSetId) return [];
    const productSet = await prisma.productSet.findFirst({
      where: {
        id: productSetId,
        entities: { some: { id: entityId } },
      },
      select: {
        products: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, photoUrl: true },
        },
      },
    });
    if (!productSet) return [];
    const used = new Set<string>(["no-product"]);
    const products = productSet.products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: uniqueSlug(product.name, used),
      imageUrl: product.photoUrl,
    }));

    if (config.allowNoProduct === true) {
      const noProductTitle =
        typeof config.noProductTitle === "string" &&
        config.noProductTitle.trim()
          ? config.noProductTitle.trim()
          : "Geen keuze";
      const noProductImageUrl =
        typeof config.noProductImageUrl === "string"
          ? config.noProductImageUrl
          : null;
      return [
        {
          id: "no-product",
          name: noProductTitle,
          slug: "no-product",
          imageUrl: noProductImageUrl,
        },
        ...products,
      ];
    }

    return products;
  }

  return [];
}

/**
 * Bootstrap voor de booking tool:
 * controleert entiteit + domein en geeft actieve flows terug.
 *
 * GET /api/public/:entitySlug/bootstrap?host=booking.example.com
 */
publicRouter.get("/:entitySlug/bootstrap", async (req, res, next) => {
  try {
    const entitySlug = String(req.params.entitySlug).trim().toLowerCase();
    const host = hostFromRequest(req);

    const entity = await prisma.entity.findUnique({
      where: { slug: entitySlug },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        logoUrl: true,
        introText: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        gtmId: true,
        headerScripts: true,
        footerScripts: true,
        active: true,
        maintenanceMode: true,
      },
    });

    if (!entity || !entity.active) {
      trackEvent({
        type: "NOT_FOUND_404",
        message: `Bootstrap: entiteit niet gevonden (${entitySlug})`,
      });
      res.status(404).json({ error: "Entiteit niet gevonden" });
      return;
    }

    const domainError = assertHostAllowed(entity.domain, host);
    if (domainError) {
      res.status(403).json({ error: domainError });
      return;
    }

    const flows = entity.maintenanceMode
      ? []
      : await prisma.flow.findMany({
          where: {
            entityId: entity.id,
            active: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
            { name: "asc" },
          ],
          select: {
            id: true,
            name: true,
            slug: true,
            featuredImage: true,
          },
        });

    res.json({
      entity: {
        name: entity.name,
        slug: entity.slug,
        domain: entity.domain,
        logoUrl: entity.logoUrl,
        introText: entity.introText,
        primaryColor: entity.primaryColor,
        secondaryColor: entity.secondaryColor,
        accentColor: entity.accentColor,
        gtmId: entity.gtmId,
        headerScripts: entity.headerScripts,
        footerScripts: entity.footerScripts,
        maintenanceMode: entity.maintenanceMode,
      },
      flows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Publieke flow + opgeloste keuzes per stap.
 *
 * GET /api/public/:entitySlug/flows/:flowSlug?host=...
 */
publicRouter.get("/:entitySlug/flows/:flowSlug", async (req, res, next) => {
  try {
    const entitySlug = String(req.params.entitySlug).trim().toLowerCase();
    const flowSlug = String(req.params.flowSlug).trim().toLowerCase();
    const scope = await resolvePublicEntity(entitySlug, hostFromRequest(req));

    if ("error" in scope) {
      if (scope.status === 404) {
        trackEvent({
          type: "NOT_FOUND_404",
          message: `Flow: entiteit niet gevonden (${entitySlug})`,
        });
      }
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const flow = await prisma.flow.findFirst({
      where: {
        entityId: scope.entity.id,
        slug: flowSlug,
        active: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        featuredImage: true,
        steps: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            type: true,
            sortOrder: true,
            config: true,
            contentBlocks: {
              where: { contentBlock: { active: true } },
              select: {
                contentBlock: {
                  select: {
                    id: true,
                    title: true,
                    text: true,
                    buttons: true,
                    sortOrder: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!flow) {
      trackEvent({
        type: "NOT_FOUND_404",
        entityId: scope.entity.id,
        message: `Flow niet gevonden (${flowSlug})`,
      });
      res.status(404).json({ error: "Flow niet gevonden" });
      return;
    }

    function normalizeButtons(value: unknown) {
      if (!Array.isArray(value)) return [];
      return value.flatMap((item) => {
        if (
          typeof item === "object" &&
          item &&
          typeof (item as { label?: unknown }).label === "string" &&
          typeof (item as { url?: unknown }).url === "string"
        ) {
          const label = (item as { label: string }).label.trim();
          const url = (item as { url: string }).url.trim();
          return label && url ? [{ label, url }] : [];
        }
        return [];
      });
    }

    function mapContentBlocks(
      links: Array<{
        contentBlock: {
          id: string;
          title: string;
          text: string;
          buttons: unknown;
          sortOrder: number;
        };
      }>,
    ) {
      return [...links]
        .map((link) => link.contentBlock)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "nl"))
        .map((block) => ({
          id: block.id,
          title: block.title,
          text: block.text,
          buttons: normalizeButtons(block.buttons),
        }));
    }

    const steps = [];
    for (const step of flow.steps) {
      if (step.type === "CONFIRMATION") continue;
      const options = await resolveStepOptions(
        step.type,
        step.config,
        scope.entity.id,
      );
      steps.push({
        id: step.id,
        type: step.type,
        sortOrder: step.sortOrder,
        title:
          step.type === "CATEGORIES" ||
          step.type === "LOCATIONS" ||
          step.type === "PRODUCT_SET"
            ? resolveStepTitle(step.config)
            : null,
        imageFit:
          step.type === "CATEGORIES" || step.type === "LOCATIONS"
            ? resolveImageFit(step.config)
            : "contain",
        options,
        contentBlocks: mapContentBlocks(step.contentBlocks),
      });
    }

    const confirmation = flow.steps.find((step) => step.type === "CONFIRMATION");
    steps.push({
      id: confirmation?.id ?? "confirmation",
      type: "CONFIRMATION",
      sortOrder: steps.length,
      title:
        (confirmation ? resolveStepTitle(confirmation.config) : null) ||
        "Persoonlijke gegevens",
      imageFit: "contain" as const,
      options: [],
      contentBlocks: confirmation
        ? mapContentBlocks(confirmation.contentBlocks)
        : [],
    });

    res.json({
      flow: {
        id: flow.id,
        name: flow.name,
        slug: flow.slug,
        featuredImage: flow.featuredImage,
      },
      steps,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Publieke analytics-events (alleen toegestane types, bv. client-side 404).
 *
 * POST /api/public/:entitySlug/analytics/events
 */
publicRouter.post("/:entitySlug/analytics/events", async (req, res, next) => {
  try {
    const entitySlug = String(req.params.entitySlug).trim().toLowerCase();
    const body = publicTrackEventSchema.parse(req.body);
    const scope = await resolvePublicEntity(entitySlug, hostFromRequest(req));

    if ("error" in scope) {
      // Still record the 404 when the entity itself is missing.
      if (scope.status === 404 && body.type === "NOT_FOUND_404") {
        trackEvent({
          type: "NOT_FOUND_404",
          message: body.message || `Track: entiteit niet gevonden (${entitySlug})`,
        });
      }
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    trackEvent({
      type: body.type,
      entityId: scope.entity.id,
      message: body.message || null,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * Publieke beschikbaarheid (geen CMS-login).
 * Scoped via entity slug in de URL.
 *
 * POST /api/public/:entitySlug/availability/slots
 */
publicRouter.post("/:entitySlug/availability/slots", async (req, res, next) => {
  try {
    const entitySlug = String(req.params.entitySlug).trim().toLowerCase();
    const body = publicAvailabilitySlotsSchema.parse(req.body);
    const scope = await resolvePublicEntity(entitySlug, hostFromRequest(req));

    if ("error" in scope) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const entity = scope.entity;

    const result = await getAvailabilitySlots({
      entityId: entity.id,
      location: body.location,
      category: body.category,
      date: body.date,
      dayStartHour: body.dayStartHour,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    // Publieke response: geen e-mail / interne Azure-details
    res.json({
      entity: {
        name: entity.name,
        slug: entity.slug,
      },
      date: result.data.date,
      weekday: result.data.weekday,
      dayStartHour: result.data.dayStartHour,
      location: result.data.location,
      category: result.data.category,
      sellers: result.data.sellers.map((seller) => ({
        sellerId: seller.sellerId,
        name: seller.name,
        imageUrl: seller.imageUrl,
        workSchedule: seller.workSchedule,
        slots: seller.slots,
        availableSlots: seller.availableSlots,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Publieke booking: blokkeert tijdslot in agenda van de verkoper.
 *
 * POST /api/public/:entitySlug/bookings
 */
function trackSubmitErrorResponse(
  entityId: string,
  status: number,
  error: string,
  extra?: {
    sellerId?: string | null;
    locationId?: string | null;
    categoryId?: string | null;
  },
) {
  trackEvent({
    type: "FORM_SUBMIT_ERROR",
    entityId,
    sellerId: extra?.sellerId,
    locationId: extra?.locationId,
    categoryId: extra?.categoryId,
    message: `HTTP ${status} · ${error}`,
  });
}

publicRouter.post("/:entitySlug/bookings", async (req, res, next) => {
  let entityId: string | null = null;

  try {
    const entitySlug = String(req.params.entitySlug).trim().toLowerCase();
    const scope = await resolvePublicEntity(entitySlug, hostFromRequest(req));

    if ("error" in scope) {
      if (scope.status === 404) {
        trackEvent({
          type: "NOT_FOUND_404",
          message: `Booking: entiteit niet gevonden (${entitySlug})`,
        });
      }
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    entityId = scope.entity.id;

    // Validatiefouten (ongeldig e-mail, ontbrekende velden, …) niet als
    // FORM_SUBMIT_ERROR tellen — alleen echte submit-/verwerkingsfouten.
    const body = publicCreateBookingSchema.parse(req.body);

    if (!isRecaptchaConfigured()) {
      const error =
        "reCAPTCHA is niet geconfigureerd op de server (RECAPTCHA_SECRET_KEY)";
      trackSubmitErrorResponse(entityId, 503, error);
      res.status(503).json({ error });
      return;
    }

    const captcha = await verifyRecaptchaToken({
      token: body.recaptchaToken,
      expectedAction: "booking",
      remoteIp: req.ip,
    });
    if (!captcha.ok) {
      trackSubmitErrorResponse(entityId, 400, captcha.error);
      res.status(400).json({ error: captcha.error });
      return;
    }

    const forwardedProto = req.get("x-forwarded-proto");
    const protocol =
      forwardedProto?.split(",")[0]?.trim() ||
      (req.protocol === "https" ? "https" : "http");
    const host = hostFromRequest(req);
    const publicBaseUrl = host ? `${protocol}://${host}` : "";

    const result = await createBooking({
      entityId: scope.entity.id,
      entityName: scope.entity.name,
      location: body.location,
      category: body.category,
      date: body.date,
      start: body.start,
      end: body.end,
      sellerId: body.sellerId,
      productName: body.productName,
      flowSlug: body.flowSlug,
      stepResults: body.stepResults,
      customer: body.customer,
      publicBaseUrl,
    });

    if (!result.ok) {
      trackSubmitErrorResponse(entityId, result.status, result.error);
      res.status(result.status).json({ error: result.error });
      return;
    }

    trackEvent({
      type: "FORM_SUBMIT_SUCCESS",
      entityId: scope.entity.id,
      sellerId: result.data.seller.sellerId,
      locationId: result.data.location?.id ?? null,
      categoryId: result.data.category?.id ?? null,
    });

    res.status(201).json({
      booking: result.data,
    });
  } catch (error) {
    // Validatie (Zod) niet loggen; wel onverwachte submitfouten.
    if (entityId && !(error instanceof ZodError)) {
      const message =
        error instanceof Error ? error.message : "Onbekende submitfout";
      trackSubmitErrorResponse(entityId, 500, message);
    }
    next(error);
  }
});
