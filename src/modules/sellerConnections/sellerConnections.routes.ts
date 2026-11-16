import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { canAccessEntity, prismaEntityWhere, resolveEntityFilter } from "../../lib/entityScope.js";
import {
  checkAvailabilityAt,
  checkCalendarVisibility,
  isAzureConfigured,
} from "../../lib/azureGraph.js";
import { getAvailabilitySlots } from "../availability/availability.service.js";
import {
  availabilityCheckSchema,
  availabilitySlotsSchema,
  availabilityTestSchema,
  sellerConnectionsQuerySchema,
} from "./sellerConnections.schemas.js";

export const sellerConnectionsRouter = Router();

sellerConnectionsRouter.use(requireAuth);

async function loadSellersForScope(entityId?: string) {
  return prisma.seller.findMany({
    where: {
      ...(entityId ? { entityId } : {}),
      active: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      active: true,
      entityId: true,
      entity: { select: { id: true, name: true, slug: true } },
    },
  });
}

sellerConnectionsRouter.get("/", async (req, res, next) => {
  try {
    const query = sellerConnectionsQuerySchema.parse(req.query);
    const filter = resolveEntityFilter(req.user!, query.entityId ?? null);

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    if (!filter.entityId) {
      res.status(400).json({ error: "entityId is verplicht" });
      return;
    }

    const configured = isAzureConfigured();
    const sellers = await loadSellersForScope(filter.entityId);

    if (!configured) {
      res.json({
        configured: false,
        message:
          "Azure Graph is nog niet geconfigureerd. Zet AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET in de omgeving.",
        connections: sellers.map((seller) => ({
          sellerId: seller.id,
          name: seller.name,
          email: seller.email,
          imageUrl: seller.imageUrl,
          entity: seller.entity,
          visible: false,
          status: "Agenda niet bereikbaar",
          detail: "Azure niet geconfigureerd",
        })),
      });
      return;
    }

    const visibility = await checkCalendarVisibility(
      sellers.map((seller) => seller.email),
    );
    const byEmail = new Map(
      visibility.map((item) => [item.email.toLowerCase(), item]),
    );

    res.json({
      configured: true,
      connections: sellers.map((seller) => {
        const match = byEmail.get(seller.email.toLowerCase());
        return {
          sellerId: seller.id,
          name: seller.name,
          email: seller.email,
          imageUrl: seller.imageUrl,
          entity: seller.entity,
          visible: match?.visible ?? false,
          status: match?.status ?? "Agenda niet bereikbaar",
          detail: match?.detail,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

sellerConnectionsRouter.post("/availability-test", async (req, res, next) => {
  try {
    const body = availabilityTestSchema.parse(req.body);
    const filter = resolveEntityFilter(req.user!, body.entityId ?? null);

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    if (!filter.entityId) {
      res.status(400).json({ error: "entityId is verplicht" });
      return;
    }

    if (!isAzureConfigured()) {
      res.status(503).json({
        error:
          "Azure Graph is nog niet geconfigureerd. Zet AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET in de omgeving.",
      });
      return;
    }

    const sellers = await loadSellersForScope(filter.entityId);
    const availability = await checkAvailabilityAt(
      sellers.map((seller) => seller.email),
      body.date,
      body.time,
      body.durationMinutes,
    );
    const byEmail = new Map(
      availability.map((item) => [item.email.toLowerCase(), item]),
    );

    const results = sellers.map((seller) => {
      const match = byEmail.get(seller.email.toLowerCase());
      return {
        sellerId: seller.id,
        name: seller.name,
        email: seller.email,
        imageUrl: seller.imageUrl,
        available: match?.available ?? false,
        status: match?.status ?? "Agenda niet bereikbaar",
        detail: match?.detail,
      };
    });

    res.json({
      date: body.date,
      time: body.time,
      durationMinutes: body.durationMinutes,
      results,
      availableCount: results.filter((item) => item.available).length,
      checked: sellers.length,
    });
  } catch (error) {
    next(error);
  }
});

/** Beschikbaarheid op basis van agenda/seller-id(s), datum en uur. */
sellerConnectionsRouter.post("/availability", async (req, res, next) => {
  try {
    const body = availabilityCheckSchema.parse(req.body);
    const sellerIds = [
      ...new Set(
        [
          ...(body.sellerId ? [body.sellerId] : []),
          ...(body.sellerIds ?? []),
        ].filter(Boolean),
      ),
    ];

    if (sellerIds.length === 0 && !body.entityId && req.user!.role === "SUPER_ADMIN") {
      res.status(400).json({
        error: "Geef sellerId, sellerIds of entityId mee",
      });
      return;
    }

    const filter = resolveEntityFilter(req.user!, body.entityId ?? null);
    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    if (!isAzureConfigured()) {
      res.status(503).json({
        error:
          "Azure Graph is nog niet geconfigureerd. Zet AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET in de omgeving.",
      });
      return;
    }

    const sellers = await prisma.seller.findMany({
      where: {
        active: true,
        ...prismaEntityWhere(filter),
        ...(sellerIds.length > 0 ? { id: { in: sellerIds } } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        entityId: true,
      },
    });

    if (sellers.some((seller) => !canAccessEntity(req.user!, seller.entityId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const results = await checkAvailabilityAt(
      sellers.map((seller) => seller.email),
      body.date,
      body.time,
      body.durationMinutes,
    );
    const byEmail = new Map(
      results.map((item) => [item.email.toLowerCase(), item]),
    );

    const available = sellers
      .map((seller) => {
        const match = byEmail.get(seller.email.toLowerCase());
        return {
          sellerId: seller.id,
          name: seller.name,
          email: seller.email,
          available: match?.available ?? false,
          status: match?.status ?? "Agenda niet bereikbaar",
          detail: match?.detail,
        };
      })
      .filter((item) => item.available);

    res.json({
      date: body.date,
      time: body.time,
      durationMinutes: body.durationMinutes,
      available,
      checked: sellers.map((seller) => ({
        sellerId: seller.id,
        email: seller.email,
        status: byEmail.get(seller.email.toLowerCase())?.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Beschikbare uursloten per verkoper op basis van:
 * locatie (permalink), categorie (slug), datum + werkschema + Azure agenda.
 */
sellerConnectionsRouter.post("/slots", async (req, res, next) => {
  try {
    const body = availabilitySlotsSchema.parse(req.body);
    const filter = resolveEntityFilter(req.user!, body.entityId ?? null);

    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }

    if (!filter.entityId) {
      res.status(400).json({ error: "entityId is verplicht" });
      return;
    }

    const result = await getAvailabilitySlots({
      entityId: filter.entityId!,
      location: body.location,
      category: body.category,
      date: body.date,
      dayStartHour: body.dayStartHour,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result.data);
  } catch (error) {
    next(error);
  }
});
