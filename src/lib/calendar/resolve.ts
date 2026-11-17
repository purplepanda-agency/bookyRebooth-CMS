import type { CalendarProvider, Entity } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../prisma.js";
import { decryptSecret } from "../secretCrypto.js";
import type {
  CalendarConfig,
  CalendarConfigPublic,
  GoogleCalendarConfig,
  OutlookCalendarConfig,
} from "./types.js";

const calendarSelect = {
  id: true,
  calendarProvider: true,
  calendarTimezone: true,
  outlookTenantId: true,
  outlookClientId: true,
  outlookClientSecretEnc: true,
  googleOAuthClientId: true,
  googleOAuthClientSecretEnc: true,
} as const;

type EntityCalendarRow = Pick<
  Entity,
  | "id"
  | "calendarProvider"
  | "calendarTimezone"
  | "outlookTenantId"
  | "outlookClientId"
  | "outlookClientSecretEnc"
  | "googleOAuthClientId"
  | "googleOAuthClientSecretEnc"
>;

export function getGoogleRedirectUri() {
  if (env.GOOGLE_OAUTH_REDIRECT_URI?.trim()) {
    return env.GOOGLE_OAUTH_REDIRECT_URI.trim();
  }
  const base = env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/google-oauth/callback`;
}

function incompleteMessage(provider: CalendarProvider) {
  if (provider === "OUTLOOK") {
    return "Outlook is gekozen, maar tenant, client ID of secret ontbreekt.";
  }
  if (provider === "GOOGLE") {
    if (!getGoogleRedirectUri()) {
      return "Google is gekozen, maar GOOGLE_OAUTH_REDIRECT_URI / PUBLIC_BASE_URL ontbreekt op de server.";
    }
    return "Google is gekozen, maar OAuth Client ID of Client secret ontbreekt.";
  }
  return "Geen agenda-provider geconfigureerd voor deze entiteit.";
}

export function toPublicCalendarConfig(
  entity: EntityCalendarRow,
): CalendarConfigPublic {
  const outlookSecretSet = Boolean(entity.outlookClientSecretEnc);
  const googleSecretSet = Boolean(entity.googleOAuthClientSecretEnc);
  const redirectUri = getGoogleRedirectUri();
  const outlookComplete =
    entity.calendarProvider === "OUTLOOK" &&
    Boolean(entity.outlookTenantId?.trim()) &&
    Boolean(entity.outlookClientId?.trim()) &&
    outlookSecretSet;
  const googleComplete =
    entity.calendarProvider === "GOOGLE" &&
    Boolean(entity.googleOAuthClientId?.trim()) &&
    googleSecretSet &&
    Boolean(redirectUri);

  const configured = outlookComplete || googleComplete;

  return {
    provider: entity.calendarProvider,
    timeZone: entity.calendarTimezone || "Europe/Brussels",
    outlookTenantId: entity.outlookTenantId,
    outlookClientId: entity.outlookClientId,
    outlookClientSecretSet: outlookSecretSet,
    googleOAuthClientId: entity.googleOAuthClientId,
    googleOAuthClientSecretSet: googleSecretSet,
    googleRedirectUri: redirectUri,
    configured,
    message: configured
      ? entity.calendarProvider === "GOOGLE"
        ? "Authenticatie gebeurt per verkoper onder Verkopersconnecties."
        : null
      : incompleteMessage(entity.calendarProvider),
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
    const clientId = entity.googleOAuthClientId?.trim();
    const secretEnc = entity.googleOAuthClientSecretEnc;
    if (!clientId || !secretEnc || !getGoogleRedirectUri()) {
      return { ok: false, error: incompleteMessage("GOOGLE") };
    }
    let clientSecret: string;
    try {
      clientSecret = decryptSecret(secretEnc);
    } catch {
      return {
        ok: false,
        error: "Google client secret kon niet ontcijferd worden.",
      };
    }
    const config: GoogleCalendarConfig = {
      provider: "GOOGLE",
      timeZone,
      entityId: entity.id,
      clientId,
      clientSecret,
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
