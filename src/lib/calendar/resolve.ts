import type { CalendarProvider, Entity } from "@prisma/client";
import { prisma } from "../prisma.js";
import { decryptSecret } from "../secretCrypto.js";
import type {
  CalendarConfig,
  CalendarConfigPublic,
  GoogleCalendarConfig,
  OutlookCalendarConfig,
} from "./types.js";

const calendarSelect = {
  calendarProvider: true,
  calendarTimezone: true,
  outlookTenantId: true,
  outlookClientId: true,
  outlookClientSecretEnc: true,
  googleClientEmail: true,
  googlePrivateKeyEnc: true,
  googleSubject: true,
} as const;

type EntityCalendarRow = Pick<
  Entity,
  | "calendarProvider"
  | "calendarTimezone"
  | "outlookTenantId"
  | "outlookClientId"
  | "outlookClientSecretEnc"
  | "googleClientEmail"
  | "googlePrivateKeyEnc"
  | "googleSubject"
>;

function incompleteMessage(provider: CalendarProvider) {
  if (provider === "OUTLOOK") {
    return "Outlook is gekozen, maar tenant, client ID of secret ontbreekt.";
  }
  if (provider === "GOOGLE") {
    return "Google is gekozen, maar service-account e-mail of private key ontbreekt.";
  }
  return "Geen agenda-provider geconfigureerd voor deze entiteit.";
}

export function toPublicCalendarConfig(
  entity: EntityCalendarRow,
): CalendarConfigPublic {
  const outlookSecretSet = Boolean(entity.outlookClientSecretEnc);
  const googleKeySet = Boolean(entity.googlePrivateKeyEnc);
  const outlookComplete =
    entity.calendarProvider === "OUTLOOK" &&
    Boolean(entity.outlookTenantId?.trim()) &&
    Boolean(entity.outlookClientId?.trim()) &&
    outlookSecretSet;
  const googleComplete =
    entity.calendarProvider === "GOOGLE" &&
    Boolean(entity.googleClientEmail?.trim()) &&
    googleKeySet;

  const configured = outlookComplete || googleComplete;

  return {
    provider: entity.calendarProvider,
    timeZone: entity.calendarTimezone || "Europe/Brussels",
    outlookTenantId: entity.outlookTenantId,
    outlookClientId: entity.outlookClientId,
    outlookClientSecretSet: outlookSecretSet,
    googleClientEmail: entity.googleClientEmail,
    googlePrivateKeySet: googleKeySet,
    googleSubject: entity.googleSubject,
    configured,
    message: configured ? null : incompleteMessage(entity.calendarProvider),
  };
}

export function decryptCalendarConfig(
  entity: EntityCalendarRow,
):
  | { ok: true; config: CalendarConfig }
  | { ok: false; error: string } {
  const timeZone = entity.calendarTimezone?.trim() || "Europe/Brussels";

  if (entity.calendarProvider === "OUTLOOK") {
    const tenantId = entity.outlookTenantId?.trim();
    const clientId = entity.outlookClientId?.trim();
    const secretEnc = entity.outlookClientSecretEnc;
    if (!tenantId || !clientId || !secretEnc) {
      return { ok: false, error: incompleteMessage("OUTLOOK") };
    }
    let clientSecret: string;
    try {
      clientSecret = decryptSecret(secretEnc);
    } catch {
      return {
        ok: false,
        error: "Outlook client secret kon niet ontcijferd worden.",
      };
    }
    const config: OutlookCalendarConfig = {
      provider: "OUTLOOK",
      timeZone,
      tenantId,
      clientId,
      clientSecret,
    };
    return { ok: true, config };
  }

  if (entity.calendarProvider === "GOOGLE") {
    const clientEmail = entity.googleClientEmail?.trim();
    const keyEnc = entity.googlePrivateKeyEnc;
    if (!clientEmail || !keyEnc) {
      return { ok: false, error: incompleteMessage("GOOGLE") };
    }
    let privateKey: string;
    try {
      privateKey = decryptSecret(keyEnc);
    } catch {
      return {
        ok: false,
        error: "Google private key kon niet ontcijferd worden.",
      };
    }
    const config: GoogleCalendarConfig = {
      provider: "GOOGLE",
      timeZone,
      clientEmail,
      privateKey,
      subject: entity.googleSubject?.trim() || null,
    };
    return { ok: true, config };
  }

  return { ok: false, error: incompleteMessage("NONE") };
}

export async function loadEntityCalendar(entityId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: calendarSelect,
  });
  if (!entity) return null;
  return entity;
}

export async function resolveCalendarConfig(entityId: string) {
  const entity = await loadEntityCalendar(entityId);
  if (!entity) {
    return { ok: false as const, error: "Entiteit niet gevonden" };
  }
  return decryptCalendarConfig(entity);
}

export { calendarSelect };
