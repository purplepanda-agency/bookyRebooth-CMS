import { prisma } from "./prisma.js";
import { decryptSecret } from "./secretCrypto.js";
import type {
  AvailabilityResult,
  CalendarReachability,
  CreateCalendarEventInput,
  CreateCalendarEventResult,
  HourlyAvailability,
  HourlySlot,
} from "./azureGraph.js";
import { getGoogleRedirectUri } from "./calendar/resolve.js";
import type { GoogleCalendarConfig } from "./calendar/types.js";

export { getGoogleRedirectUri };

type SellerGoogleAuth = {
  email: string;
  refreshToken: string;
  connectedEmail: string | null;
};

type FreeBusyResponse = {
  calendars?: Record<
    string,
    {
      errors?: Array<{ domain?: string; reason?: string }>;
      busy?: Array<{ start?: string; end?: string }>;
    }
  >;
};

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

function wallClockToUtcMs(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcGuess));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offset = asUtc - utcGuess;
  return utcGuess - offset;
}

function toRfc3339Utc(date: string, time: string, timeZone: string) {
  return new Date(wallClockToUtcMs(date, time, timeZone)).toISOString();
}

function addMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h! * 60 + m! + minutes;
  const dayOffset = Math.floor(total / (24 * 60));
  const minsInDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextH = Math.floor(minsInDay / 60);
  const nextM = minsInDay % 60;
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const y = base.getUTCFullYear();
  const mo = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return {
    date: `${y}-${mo}-${d}`,
    time: `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`,
  };
}

async function loadSellerAuths(
  entityId: string,
  emails: string[],
): Promise<Map<string, SellerGoogleAuth | null>> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  const sellers = await prisma.seller.findMany({
    where: {
      entityId,
      active: true,
      email: { in: uniqueEmails },
    },
    select: {
      email: true,
      googleRefreshTokenEnc: true,
      googleConnectedEmail: true,
    },
  });

  const byEmail = new Map<string, SellerGoogleAuth | null>();
  for (const email of uniqueEmails) {
    byEmail.set(email, null);
  }

  for (const seller of sellers) {
    const key = seller.email.trim().toLowerCase();
    if (!seller.googleRefreshTokenEnc) {
      byEmail.set(key, null);
      continue;
    }
    try {
      byEmail.set(key, {
        email: key,
        refreshToken: decryptSecret(seller.googleRefreshTokenEnc),
        connectedEmail: seller.googleConnectedEmail,
      });
    } catch {
      byEmail.set(key, null);
    }
  }

  return byEmail;
}

async function getAccessToken(
  config: Pick<GoogleCalendarConfig, "clientId" | "clientSecret">,
  refreshToken: string,
): Promise<string> {
  const now = Date.now();
  const cacheKey = `${config.clientId}:${refreshToken}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token vernieuwen mislukt (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });

  return data.access_token;
}

function calendarIdForAuth(auth: SellerGoogleAuth) {
  // freeBusy accepts email / calendar id; "primary" is unreliable there.
  return (auth.connectedEmail || auth.email || "primary").trim().toLowerCase();
}

async function freeBusyForSeller(
  config: GoogleCalendarConfig,
  auth: SellerGoogleAuth,
  timeMin: string,
  timeMax: string,
  timeZone: string,
) {
  const accessToken = await getAccessToken(config, auth.refreshToken);
  const calendarId = calendarIdForAuth(auth);
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: calendarId }],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("[google] freeBusy failed:", response.status, text);
    throw new Error(`Google freeBusy mislukt (${response.status}): ${text}`);
  }

  const data = (await response.json()) as FreeBusyResponse;
  const calendar = data.calendars?.[calendarId] ?? data.calendars?.primary;
  if (calendar?.errors?.length) {
    const reason = calendar.errors
      .map((err) => err.reason || "calendar error")
      .join(", ");
    console.error("[google] freeBusy calendar errors:", calendarId, reason);
    throw new Error(reason);
  }
  return calendar?.busy ?? [];
}

/** Lightweight reachability probe (clearer errors than freeBusy alone). */
async function probeCalendarAccess(
  config: GoogleCalendarConfig,
  auth: SellerGoogleAuth,
) {
  const accessToken = await getAccessToken(config, auth.refreshToken);
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    const text = await response.text();
    console.error("[google] calendarList probe failed:", response.status, text);
    if (response.status === 403 && text.includes("accessNotConfigured")) {
      throw new Error(
        "Google Calendar API is niet ingeschakeld in dit Google Cloud-project",
      );
    }
    throw new Error(`Google Calendar niet bereikbaar (${response.status}): ${text}`);
  }
}

function overlaps(
  busyStart: string,
  busyEnd: string,
  slotStartMs: number,
  slotEndMs: number,
) {
  const start = Date.parse(busyStart);
  const end = Date.parse(busyEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start < slotEndMs && end > slotStartMs;
}

export async function checkCalendarVisibility(
  config: GoogleCalendarConfig,
  emails: string[],
): Promise<CalendarReachability[]> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  if (uniqueEmails.length === 0) return [];

  const auths = await loadSellerAuths(config.entityId, uniqueEmails);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const end = addMinutes(date, time, 30);
  const timeMin = toRfc3339Utc(date, time, config.timeZone);
  const timeMax = toRfc3339Utc(end.date, end.time, config.timeZone);

  return Promise.all(
    uniqueEmails.map(async (email) => {
      const auth = auths.get(email);
      if (!auth) {
        return {
          email,
          visible: false,
          status: "Agenda niet bereikbaar" as const,
          detail: "Google-agenda niet gekoppeld",
        };
      }

      try {
        await probeCalendarAccess(config, auth);
        await freeBusyForSeller(config, auth, timeMin, timeMax, config.timeZone);
        return {
          email,
          visible: true,
          status: "Agenda zichtbaar" as const,
          detail: auth.connectedEmail
            ? `Gekoppeld als ${auth.connectedEmail}`
            : undefined,
        };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Onbekende fout";
        console.error("[google] visibility failed for", email, detail);
        return {
          email,
          visible: false,
          status: "Agenda niet bereikbaar" as const,
          detail,
        };
      }
    }),
  );
}

export async function checkAvailabilityAt(
  config: GoogleCalendarConfig,
  emails: string[],
  date: string,
  time: string,
  durationMinutes = 30,
): Promise<AvailabilityResult[]> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  if (uniqueEmails.length === 0) return [];

  const auths = await loadSellerAuths(config.entityId, uniqueEmails);
  const end = addMinutes(date, time, durationMinutes);
  const timeMin = toRfc3339Utc(date, time, config.timeZone);
  const timeMax = toRfc3339Utc(end.date, end.time, config.timeZone);
  const slotStartMs = wallClockToUtcMs(date, time, config.timeZone);
  const slotEndMs = wallClockToUtcMs(end.date, end.time, config.timeZone);

  return Promise.all(
    uniqueEmails.map(async (email) => {
      const auth = auths.get(email);
      if (!auth) {
        return {
          email,
          available: false,
          status: "Agenda niet bereikbaar" as const,
          detail: "Google-agenda niet gekoppeld",
        };
      }

      try {
        const busy = await freeBusyForSeller(
          config,
          auth,
          timeMin,
          timeMax,
          config.timeZone,
        );
        const blocked = busy.some(
          (item) =>
            item.start &&
            item.end &&
            overlaps(item.start, item.end, slotStartMs, slotEndMs),
        );
        return {
          email,
          available: !blocked,
          status: blocked
            ? ("Niet beschikbaar" as const)
            : ("Beschikbaar" as const),
        };
      } catch (error) {
        return {
          email,
          available: false,
          status: "Agenda niet bereikbaar" as const,
          detail: error instanceof Error ? error.message : "Onbekende fout",
        };
      }
    }),
  );
}

export async function checkHourlyAvailability(
  config: GoogleCalendarConfig,
  emails: string[],
  date: string,
  slots: HourlySlot[],
): Promise<HourlyAvailability[]> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];

  if (uniqueEmails.length === 0 || slots.length === 0) {
    return uniqueEmails.map((email) => ({
      email,
      reachable: false,
      detail: "Geen slots",
      slots: [],
    }));
  }

  const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  const windowStart = sorted[0]!.start;
  const windowEnd = sorted[sorted.length - 1]!.end;
  const timeMin = toRfc3339Utc(date, windowStart, config.timeZone);
  const timeMax = toRfc3339Utc(date, windowEnd, config.timeZone);
  const auths = await loadSellerAuths(config.entityId, uniqueEmails);

  return Promise.all(
    uniqueEmails.map(async (email) => {
      const auth = auths.get(email);
      if (!auth) {
        return {
          email,
          reachable: false,
          detail: "Google-agenda niet gekoppeld",
          slots: slots.map((slot) => ({ ...slot, available: false })),
        };
      }

      try {
        const busy = await freeBusyForSeller(
          config,
          auth,
          timeMin,
          timeMax,
          config.timeZone,
        );
        return {
          email,
          reachable: true,
          slots: slots.map((slot) => {
            const startMs = wallClockToUtcMs(date, slot.start, config.timeZone);
            const endMs = wallClockToUtcMs(date, slot.end, config.timeZone);
            const blocked = busy.some(
              (item) =>
                item.start &&
                item.end &&
                overlaps(item.start, item.end, startMs, endMs),
            );
            return { ...slot, available: !blocked };
          }),
        };
      } catch (error) {
        return {
          email,
          reachable: false,
          detail: error instanceof Error ? error.message : "Onbekende fout",
          slots: slots.map((slot) => ({ ...slot, available: false })),
        };
      }
    }),
  );
}

export async function createCalendarEvent(
  config: GoogleCalendarConfig,
  input: CreateCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const sellerEmail = input.sellerEmail.trim().toLowerCase();
  const auths = await loadSellerAuths(config.entityId, [sellerEmail]);
  const auth = auths.get(sellerEmail);
  if (!auth) {
    throw new Error("Google-agenda niet gekoppeld voor deze verkoper");
  }

  const accessToken = await getAccessToken(config, auth.refreshToken);
  const locationDisplay = [input.locationName, input.locationAddress]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" — ");

  const attendees = (input.attendees ?? [])
    .map((guest) => {
      const address = guest.email.trim().toLowerCase();
      if (!address) return null;
      return {
        email: address,
        ...(guest.name?.trim() ? { displayName: guest.name.trim() } : {}),
      };
    })
    .filter((guest): guest is NonNullable<typeof guest> => Boolean(guest));

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.subject,
        description: input.bodyHtml
          ? input.bodyHtml.replace(/<[^>]+>/g, " ").trim()
          : undefined,
        location: locationDisplay || input.locationName,
        start: {
          dateTime: toRfc3339Utc(input.date, input.start, config.timeZone),
          timeZone: config.timeZone,
        },
        end: {
          dateTime: toRfc3339Utc(input.date, input.end, config.timeZone),
          timeZone: config.timeZone,
        },
        attendees,
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 15 }],
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google event aanmaken mislukt (${response.status}): ${text}`,
    );
  }

  const data = (await response.json()) as { id?: string; htmlLink?: string };
  if (!data.id) {
    throw new Error("Google event aanmaken mislukt: geen event-id");
  }

  return { id: data.id, webLink: data.htmlLink };
}
