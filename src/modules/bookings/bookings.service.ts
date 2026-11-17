import { prisma } from "../../lib/prisma.js";
import { trackEvent } from "../../lib/analytics.js";
import {
  createCalendarEvent,
  getEntityCalendarConfig,
} from "../../lib/calendar/index.js";
import {
  absoluteMediaUrl,
  buildBookingMailData,
  buildSellerBookingMailData,
  formatAppointmentTime,
  isSellerBookingMailConfigured,
  isSendGridConfigured,
  sendBookingConfirmationEmail,
  sendGridMissingConfig,
  sendSellerBookingEmail,
  sellerSendGridMissingConfig,
} from "../../lib/sendgrid.js";
import { env } from "../../config/env.js";
import {
  buildBookingCurrentUrl,
  buildResultStepContext,
  interestVehicleNewUsedFromCategorySlug,
  isWebhookPayload,
  renderWebhookPayload,
  sendWebhook,
  type WebhookPayload,
} from "../../lib/webhook.js";
import { getAvailabilitySlots } from "../availability/availability.service.js";

export type CreateBookingInput = {
  entityId: string;
  entityName: string;
  location: string;
  category: string;
  date: string;
  start: string;
  end: string;
  sellerId: string | null;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address?: string;
    currentVehicle?: string;
    extraInfo?: string;
  };
  productName?: string | null;
  flowSlug?: string | null;
  stepResults?: Array<{
    index: number;
    type: string;
    name: string;
    slug: string;
  }>;
  publicBaseUrl: string;
};

type ConfirmationWebhookConfig = {
  webhookUrl: string;
  webhookName: string;
  webhookPayload: WebhookPayload | null;
};

function parseWebhookEntries(
  record: Record<string, unknown>,
): ConfirmationWebhookConfig[] {
  const list = record.webhooks;
  if (Array.isArray(list)) {
    const fromList = list
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
      .map((item) => {
        const url =
          typeof item.url === "string"
            ? item.url.trim()
            : typeof item.webhookUrl === "string"
              ? item.webhookUrl.trim()
              : "";
        const name =
          typeof item.name === "string"
            ? item.name.trim()
            : typeof item.webhookName === "string"
              ? item.webhookName.trim()
              : "";
        const payloadRaw = item.payload ?? item.webhookPayload;
        return {
          webhookUrl: url,
          webhookName: name,
          webhookPayload: isWebhookPayload(payloadRaw)
            ? (payloadRaw as WebhookPayload)
            : null,
        };
      })
      .filter((item) => Boolean(item.webhookUrl));
    if (fromList.length > 0) return fromList;
  }

  // Legacy single-webhook config
  const webhookUrl =
    typeof record.webhookUrl === "string" ? record.webhookUrl.trim() : "";
  if (!webhookUrl) return [];

  return [
    {
      webhookUrl,
      webhookName:
        typeof record.webhookName === "string" ? record.webhookName.trim() : "",
      webhookPayload: isWebhookPayload(record.webhookPayload)
        ? (record.webhookPayload as WebhookPayload)
        : null,
    },
  ];
}

function dedupeWebhooks(
  entries: ConfirmationWebhookConfig[],
): ConfirmationWebhookConfig[] {
  const seen = new Set<string>();
  const out: ConfirmationWebhookConfig[] = [];
  for (const entry of entries) {
    const key = entry.webhookUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

type FlowWebhookBundle = {
  flow: { name: string; slug: string };
  webhooks: ConfirmationWebhookConfig[];
};

async function loadConfirmationWebhooks(
  entityId: string,
  flowSlug?: string | null,
): Promise<FlowWebhookBundle> {
  const slug = flowSlug?.trim().toLowerCase() || null;
  const emptyFlow = { name: "", slug: slug || "" };

  if (slug) {
    const flow = await prisma.flow.findFirst({
      where: { entityId, slug },
      select: {
        name: true,
        slug: true,
        active: true,
        steps: {
          where: { type: "CONFIRMATION" },
          take: 1,
          select: { config: true },
        },
      },
    });

    const flowInfo = flow
      ? { name: flow.name, slug: flow.slug }
      : emptyFlow;

    const config = flow?.steps[0]?.config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      const entries = parseWebhookEntries(config as Record<string, unknown>);
      if (entries.length > 0) {
        return {
          flow: flowInfo,
          webhooks: dedupeWebhooks(entries),
        };
      }
      console.warn(
        `[booking] Geen webhook-URL in confirmation-config (flow=${slug}, active=${flow?.active ?? false})`,
      );
    } else {
      console.warn(
        `[booking] Geen confirmation-stap gevonden voor flow=${slug} entity=${entityId}`,
      );
    }

    return { flow: flowInfo, webhooks: [] };
  }

  console.warn(
    `[booking] flowSlug ontbreekt in booking-request; fallback op alle entity-webhooks`,
  );

  // Fallback: alle confirmation-stappen van deze entiteit (bv. oude TOOL zonder flowSlug)
  const steps = await prisma.flowStep.findMany({
    where: {
      type: "CONFIRMATION",
      flow: { entityId },
    },
    select: {
      config: true,
      flow: { select: { name: true, slug: true } },
    },
  });

  const collected: ConfirmationWebhookConfig[] = [];
  let fallbackFlow = emptyFlow;
  for (const step of steps) {
    const config = step.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      continue;
    }
    const entries = parseWebhookEntries(config as Record<string, unknown>);
    if (entries.length > 0 && !fallbackFlow.name) {
      fallbackFlow = { name: step.flow.name, slug: step.flow.slug };
    }
    collected.push(...entries);
  }

  const unique = dedupeWebhooks(collected);
  if (unique.length === 0) {
    console.warn(
      `[booking] Geen webhooks geconfigureerd voor entity=${entityId}`,
    );
  } else {
    console.info(
      `[booking] ${unique.length} webhook(s) geladen via entity-fallback`,
    );
  }
  return { flow: fallbackFlow, webhooks: unique };
}

export type CreateBookingResult = {
  seller: {
    sellerId: string;
    name: string;
    imageUrl: string | null;
  };
  location: {
    id: string;
    name: string;
    permalink: string;
    address: string;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  };
  date: string;
  start: string;
  end: string;
  customerName: string;
  productName: string | null;
  calendarEventId: string;
  mailSent: boolean;
  mailError?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pickAssignedSeller<T extends { sellerId: string }>(
  candidates: T[],
  key: string,
) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return candidates[hash % candidates.length]!;
}

function resolvePublicBaseUrl(requestBaseUrl: string) {
  // Prefer configured public URL so email images are reachable (not localhost).
  const fromEnv = (env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return requestBaseUrl.trim().replace(/\/$/, "");
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<
  | { ok: true; data: CreateBookingResult }
  | { ok: false; status: number; error: string }
> {
  const calendarConfig = await getEntityCalendarConfig(input.entityId);
  if (!calendarConfig.ok) {
    return {
      ok: false,
      status: 503,
      error: calendarConfig.error,
    };
  }

  const availability = await getAvailabilitySlots({
    entityId: input.entityId,
    location: input.location,
    category: input.category,
    date: input.date,
    dayStartHour: 0,
  });

  if (!availability.ok) {
    return availability;
  }

  type SellerRow = (typeof availability.data.sellers)[number];
  const forSlot = (seller: SellerRow) =>
    seller.slots.some(
      (slot) =>
        slot.available &&
        slot.start === input.start &&
        slot.end === input.end,
    );

  let chosen: SellerRow | null = null;
  if (input.sellerId) {
    chosen =
      availability.data.sellers.find(
        (seller) => seller.sellerId === input.sellerId && forSlot(seller),
      ) ?? null;
  } else {
    const candidates = availability.data.sellers.filter(forSlot);
    chosen = pickAssignedSeller(
      candidates,
      `${input.date}|${input.start}|${input.end}`,
    );
  }

  if (!chosen) {
    return {
      ok: false,
      status: 409,
      error: "Dit tijdslot is niet meer beschikbaar voor de gekozen verkoper.",
    };
  }

  const customerName =
    `${input.customer.firstName.trim()} ${input.customer.lastName.trim()}`.trim();
  const location = availability.data.location;
  const subject = `Afspraak met ${customerName} en ${chosen.name} @ ${location.name}.`;

  const details: string[] = [
    `<p><strong>${escapeHtml(subject)}</strong></p>`,
    `<p>Locatie: ${escapeHtml(location.name)}<br/>${escapeHtml(location.address)}</p>`,
    `<p>Tijd: ${escapeHtml(input.date)} ${escapeHtml(input.start)} – ${escapeHtml(input.end)}</p>`,
    `<p>Klant: ${escapeHtml(customerName)}<br/>Tel: ${escapeHtml(input.customer.phone)}<br/>E-mail: ${escapeHtml(input.customer.email)}</p>`,
  ];
  if (input.customer.address?.trim()) {
    details.push(`<p>Adres klant: ${escapeHtml(input.customer.address.trim())}</p>`);
  }
  if (input.productName?.trim()) {
    details.push(`<p>Product: ${escapeHtml(input.productName.trim())}</p>`);
  }
  if (input.customer.currentVehicle?.trim()) {
    details.push(
      `<p>Huidig voertuig: ${escapeHtml(input.customer.currentVehicle.trim())}</p>`,
    );
  }
  if (input.customer.extraInfo?.trim()) {
    details.push(
      `<p>Extra info: ${escapeHtml(input.customer.extraInfo.trim())}</p>`,
    );
  }

  try {
    const event = await createCalendarEvent(calendarConfig.config, {
      sellerEmail: chosen.email,
      subject,
      bodyHtml: details.join("\n"),
      date: input.date,
      start: input.start,
      end: input.end,
      locationName: location.name,
      locationAddress: location.address,
      attendees: [
        {
          email: input.customer.email,
          name: customerName,
        },
      ],
    });

    let mailSent = false;
    let mailError: string | undefined;

    const entity = await prisma.entity.findUnique({
      where: { id: input.entityId },
      select: { emailExtraTxt: true, logoUrl: true },
    });
    const publicBaseUrl = resolvePublicBaseUrl(input.publicBaseUrl);
    const entityLogo = absoluteMediaUrl(entity?.logoUrl, publicBaseUrl);
    const locationImage = absoluteMediaUrl(location.imageUrl, publicBaseUrl);
    const appointmentLabel = formatAppointmentTime(
      input.date,
      input.start,
      input.end,
    );

    if (isSendGridConfigured()) {
      try {
        await sendBookingConfirmationEmail({
          toEmail: input.customer.email,
          toName: customerName,
          data: buildBookingMailData({
            locationName: location.name,
            locationAddress: location.address,
            time: appointmentLabel,
            employeeName: chosen.name,
            emailExtraTxt: entity?.emailExtraTxt || "",
            entityLogo,
            locationImage,
            employeeImage: absoluteMediaUrl(chosen.imageUrl, publicBaseUrl),
          }),
        });
        mailSent = true;
      } catch (error) {
        mailError =
          error instanceof Error ? error.message : "Bevestigingsmail mislukt";
        console.error("[booking] SendGrid customer error:", mailError);
        trackEvent({
          type: "EMAIL_ERROR",
          entityId: input.entityId,
          sellerId: chosen.sellerId,
          locationId: location.id,
          categoryId: availability.data.category.id,
          message: mailError,
        });
      }
    } else {
      const missing = sendGridMissingConfig();
      mailError =
        missing.length > 0
          ? `SendGrid is niet geconfigureerd (ontbreekt: ${missing.join(", ")})`
          : "SendGrid is niet geconfigureerd";
      trackEvent({
        type: "EMAIL_ERROR",
        entityId: input.entityId,
        sellerId: chosen.sellerId,
        locationId: location.id,
        categoryId: availability.data.category.id,
        message: mailError,
      });
    }

    if (isSellerBookingMailConfigured()) {
      try {
        await sendSellerBookingEmail({
          toEmail: chosen.email,
          toName: chosen.name,
          data: buildSellerBookingMailData({
            entityLogo,
            locationImage,
            clientName: customerName,
            date: appointmentLabel,
            location: location.name,
            telefoonNummer: input.customer.phone.trim(),
            emailAdres: input.customer.email.trim(),
            address: input.customer.address?.trim() || "",
            productName: input.productName,
            currentVehicle: input.customer.currentVehicle,
            remarks: input.customer.extraInfo,
          }),
        });
      } catch (error) {
        const sellerMailError =
          error instanceof Error
            ? error.message
            : "Verkoper-bevestigingsmail mislukt";
        console.error("[booking] SendGrid seller error:", sellerMailError);
        if (!mailError) mailError = sellerMailError;
        trackEvent({
          type: "EMAIL_ERROR",
          entityId: input.entityId,
          sellerId: chosen.sellerId,
          locationId: location.id,
          categoryId: availability.data.category.id,
          message: `Verkoper-mail: ${sellerMailError}`,
        });
      }
    } else {
      const missing = sellerSendGridMissingConfig();
      const sellerMissing =
        missing.length > 0
          ? `SendGrid verkoper-mail niet geconfigureerd (ontbreekt: ${missing.join(", ")})`
          : "SendGrid verkoper-mail niet geconfigureerd";
      console.warn(`[booking] ${sellerMissing}`);
      trackEvent({
        type: "EMAIL_ERROR",
        entityId: input.entityId,
        sellerId: chosen.sellerId,
        locationId: location.id,
        categoryId: availability.data.category.id,
        message: sellerMissing,
      });
    }

    const webhookBundle = await loadConfirmationWebhooks(
      input.entityId,
      input.flowSlug,
    );
    if (webhookBundle.webhooks.length === 0) {
      console.warn(
        `[booking] Geen webhooks om te versturen (entity=${input.entityId}, flowSlug=${input.flowSlug ?? "—"})`,
      );
    }
    const webhookPublicBaseUrl = resolvePublicBaseUrl(input.publicBaseUrl);
    const currentUrl = buildBookingCurrentUrl(
      webhookPublicBaseUrl,
      webhookBundle.flow.slug || input.flowSlug,
    );

    const resultStepContext = buildResultStepContext(input.stepResults);

    for (const webhookConfig of webhookBundle.webhooks) {
      const categorySlug = availability.data.category.slug;
      const payload = renderWebhookPayload(webhookConfig.webhookPayload, {
        webhookName: webhookConfig.webhookName,
        entityName: input.entityName,
        currentUrl,
        flow: webhookBundle.flow,
        interestvehiclenewused:
          interestVehicleNewUsedFromCategorySlug(categorySlug),
        date: input.date,
        start: input.start,
        end: input.end,
        productName: input.productName?.trim() || null,
        seller: {
          id: chosen.sellerId,
          name: chosen.name,
        },
        location: {
          id: location.id,
          name: location.name,
          permalink: location.permalink,
          address: location.address,
        },
        category: {
          id: availability.data.category.id,
          name: availability.data.category.name,
          slug: categorySlug,
        },
        customer: {
          firstName: input.customer.firstName.trim(),
          lastName: input.customer.lastName.trim(),
          fullName: customerName,
          phone: input.customer.phone.trim(),
          email: input.customer.email.trim(),
          address: input.customer.address?.trim() || "",
          currentVehicle: input.customer.currentVehicle?.trim() || "",
          extraInfo: input.customer.extraInfo?.trim() || "",
        },
        ...resultStepContext,
      });

      console.info(
        `[booking] Webhook POST → ${webhookConfig.webhookName || webhookConfig.webhookUrl}`,
      );
      const webhookResult = await sendWebhook(
        webhookConfig.webhookUrl,
        payload,
      );
      if (!webhookResult.ok) {
        const label = webhookConfig.webhookName || webhookConfig.webhookUrl;
        console.error("[booking] Webhook error:", label, webhookResult.error);
        trackEvent({
          type: "MAKE_ERROR",
          entityId: input.entityId,
          sellerId: chosen.sellerId,
          locationId: location.id,
          categoryId: availability.data.category.id,
          message: `${label}: ${webhookResult.error}`,
        });
      } else {
        console.info(
          `[booking] Webhook OK (${webhookResult.status}) → ${webhookConfig.webhookName || webhookConfig.webhookUrl}`,
        );
      }
    }

    return {
      ok: true,
      data: {
        seller: {
          sellerId: chosen.sellerId,
          name: chosen.name,
          imageUrl: chosen.imageUrl,
        },
        location: {
          id: location.id,
          name: location.name,
          permalink: location.permalink,
          address: location.address,
        },
        category: availability.data.category,
        date: input.date,
        start: input.start,
        end: input.end,
        customerName,
        productName: input.productName?.trim() || null,
        calendarEventId: event.id,
        mailSent,
        mailError,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error:
        error instanceof Error
          ? error.message
          : "Agenda-item aanmaken mislukt",
    };
  }
}
