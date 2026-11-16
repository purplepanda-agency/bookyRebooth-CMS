import type { OutlookCalendarConfig } from "./calendar/types.js";

export type AzureCredentials = Pick<
  OutlookCalendarConfig,
  "tenantId" | "clientId" | "clientSecret" | "timeZone"
>;

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

type GraphScheduleItem = {
  status?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
};

type GraphSchedule = {
  scheduleId?: string;
  availabilityView?: string;
  scheduleItems?: GraphScheduleItem[];
  error?: {
    message?: string;
    responseCode?: string;
  };
};

export type CalendarReachability = {
  email: string;
  visible: boolean;
  status: "Agenda zichtbaar" | "Agenda niet bereikbaar";
  detail?: string;
};

export type AvailabilityResult = {
  email: string;
  available: boolean;
  status: "Beschikbaar" | "Niet beschikbaar" | "Agenda niet bereikbaar";
  detail?: string;
};

const tokenCacheByApp = new Map<string, TokenCache>();

export function isAzureConfigured(credentials: AzureCredentials | null | undefined) {
  return Boolean(
    credentials?.tenantId?.trim() &&
      credentials?.clientId?.trim() &&
      credentials?.clientSecret?.trim(),
  );
}

function cacheKey(credentials: AzureCredentials) {
  return `${credentials.tenantId}:${credentials.clientId}`;
}

async function getAccessToken(credentials: AzureCredentials): Promise<string> {
  if (!isAzureConfigured(credentials)) {
    throw new Error("Azure Graph is niet geconfigureerd");
  }

  const now = Date.now();
  const key = cacheKey(credentials);
  const cached = tokenCacheByApp.get(key);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Azure token ophalen mislukt (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCacheByApp.set(key, {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });

  return data.access_token;
}

function toGraphDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

/** Windows / Graph timezone aliases → IANA (for Intl parsing). */
const WINDOWS_TO_IANA: Record<string, string> = {
  utc: "UTC",
  "romance standard time": "Europe/Brussels",
  "w. europe standard time": "Europe/Brussels",
  "central european standard time": "Europe/Warsaw",
  "gmt standard time": "Europe/London",
};

function resolveIanaTimeZone(timeZone?: string) {
  const raw = (timeZone || "UTC").trim();
  if (!raw) return "UTC";
  const mapped = WINDOWS_TO_IANA[raw.toLowerCase()];
  return mapped || raw;
}

function getZonedParts(utcMs: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second || "0"),
  };
}

/**
 * Interpret a wall-clock date/time in `timeZone` as UTC epoch ms.
 * Avoids `new Date("…T12:30:00")` which uses the server's local zone.
 */
function wallClockToUtcMs(
  date: string,
  time: string,
  timeZone: string,
): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const desiredAsUtc = Date.UTC(
    year!,
    (month || 1) - 1,
    day || 1,
    hour || 0,
    minute || 0,
    second || 0,
  );
  let utcMs = desiredAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(utcMs, timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    utcMs += desiredAsUtc - asUtc;
  }
  return utcMs;
}

/**
 * Graph dateTimeTimeZone values often omit an offset. Without Prefer they are
 * UTC wall-clock strings with timeZone "UTC"; `new Date(dateTime)` wrongly
 * treats them as server-local and shifts busy blocks (e.g. 12:30→11:30 CET).
 */
function parseGraphDateTime(dateTime: string, timeZone?: string): number {
  const trimmed = dateTime.trim();
  const withoutFraction = trimmed.replace(/\.\d+/, "");
  if (/Z$/i.test(withoutFraction) || /[+-]\d{2}:\d{2}$/.test(withoutFraction)) {
    return Date.parse(withoutFraction);
  }

  const match = withoutFraction.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/,
  );
  if (!match) return Date.parse(trimmed);

  const iana = resolveIanaTimeZone(timeZone);
  if (iana === "UTC") {
    return Date.parse(`${match[1]}T${match[2]}Z`);
  }
  const time =
    match[2].length === 5 ? `${match[2]}:00` : match[2];
  return wallClockToUtcMs(match[1]!, time, iana);
}

function addMinutesWallClock(
  date: string,
  time: string,
  minutes: number,
  timeZone: string,
) {
  const startMs = wallClockToUtcMs(date, time, timeZone);
  const end = new Date(startMs + minutes * 60_000);
  const parts = getZonedParts(end.getTime(), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

function overlapsSlot(
  item: GraphScheduleItem,
  slotStartMs: number,
  slotEndMs: number,
): boolean {
  if (!item.start?.dateTime || !item.end?.dateTime) return false;
  const itemStart = parseGraphDateTime(
    item.start.dateTime,
    item.start.timeZone,
  );
  const itemEnd = parseGraphDateTime(item.end.dateTime, item.end.timeZone);
  return itemStart < slotEndMs && itemEnd > slotStartMs;
}

async function getSchedules(
  credentials: AzureCredentials,
  emails: string[],
  startDate: string,
  startTime: string,
  durationMinutes: number,
): Promise<GraphSchedule[]> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  if (uniqueEmails.length === 0) return [];

  const token = await getAccessToken(credentials);
  const timeZone = credentials.timeZone || "Europe/Brussels";
  const end = addMinutesWallClock(
    startDate,
    startTime,
    durationMinutes,
    timeZone,
  );
  const organizer = uniqueEmails[0];

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizer)}/calendar/getSchedule`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Return scheduleItems in our app timezone (not naked UTC strings).
        Prefer: `outlook.timezone="${timeZone}"`,
      },
      body: JSON.stringify({
        schedules: uniqueEmails,
        startTime: {
          dateTime: toGraphDateTime(startDate, startTime),
          timeZone,
        },
        endTime: {
          dateTime: toGraphDateTime(end.date, end.time),
          timeZone,
        },
        availabilityViewInterval: 30,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph getSchedule mislukt (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { value?: GraphSchedule[] };
  return data.value ?? [];
}

function findSchedule(schedules: GraphSchedule[], email: string) {
  const needle = email.trim().toLowerCase();
  return schedules.find(
    (item) => (item.scheduleId || "").trim().toLowerCase() === needle,
  );
}

export async function checkCalendarVisibility(
  credentials: AzureCredentials,
  emails: string[],
): Promise<CalendarReachability[]> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];

  if (uniqueEmails.length === 0) return [];

  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  try {
    const schedules = await getSchedules(
      credentials,
      uniqueEmails,
      date,
      time,
      30,
    );

    return uniqueEmails.map((email) => {
      const schedule = findSchedule(schedules, email);
      if (!schedule) {
        return {
          email,
          visible: false,
          status: "Agenda niet bereikbaar" as const,
          detail: "Geen antwoord van Azure",
        };
      }

      if (schedule.error) {
        return {
          email,
          visible: false,
          status: "Agenda niet bereikbaar" as const,
          detail: schedule.error.message || schedule.error.responseCode,
        };
      }

      return {
        email,
        visible: true,
        status: "Agenda zichtbaar" as const,
      };
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende fout";
    return uniqueEmails.map((email) => ({
      email,
      visible: false,
      status: "Agenda niet bereikbaar" as const,
      detail,
    }));
  }
}

function isScheduleBusy(
  schedule: GraphSchedule,
  slotStartMs: number,
  slotEndMs: number,
): boolean {
  return (schedule.scheduleItems ?? []).some((item) => {
    const status = (item.status || "").toLowerCase();
    if (status === "free" || status === "workingelsewhere") return false;
    return overlapsSlot(item, slotStartMs, slotEndMs);
  });
}

export async function checkAvailabilityAt(
  credentials: AzureCredentials,
  emails: string[],
  date: string,
  time: string,
  durationMinutes = 30,
): Promise<AvailabilityResult[]> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];

  if (uniqueEmails.length === 0) return [];

  const timeZone = credentials.timeZone || "Europe/Brussels";
  const slotStartMs = wallClockToUtcMs(date, time, timeZone);
  const slotEndMs = slotStartMs + durationMinutes * 60_000;
  const schedules = await getSchedules(
    credentials,
    uniqueEmails,
    date,
    time,
    durationMinutes,
  );

  return uniqueEmails.map((email) => {
    const schedule = findSchedule(schedules, email);

    if (!schedule || schedule.error) {
      return {
        email,
        available: false,
        status: "Agenda niet bereikbaar" as const,
        detail: schedule?.error?.message || schedule?.error?.responseCode,
      };
    }

    const busy = isScheduleBusy(schedule, slotStartMs, slotEndMs);

    return {
      email,
      available: !busy,
      status: busy ? ("Niet beschikbaar" as const) : ("Beschikbaar" as const),
    };
  });
}

export type HourlySlot = {
  start: string;
  end: string;
};

export type HourlyAvailability = {
  email: string;
  reachable: boolean;
  detail?: string;
  slots: Array<HourlySlot & { available: boolean }>;
};

export type CreateCalendarEventAttendee = {
  email: string;
  name?: string;
};

export type CreateCalendarEventInput = {
  sellerEmail: string;
  subject: string;
  bodyHtml?: string;
  date: string;
  start: string;
  end: string;
  locationName: string;
  locationAddress?: string | null;
  /** Invited guests (e.g. customer) — Graph sends calendar invites. */
  attendees?: CreateCalendarEventAttendee[];
};

export type CreateCalendarEventResult = {
  id: string;
  webLink?: string;
};

export async function createCalendarEvent(
  credentials: AzureCredentials,
  input: CreateCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const token = await getAccessToken(credentials);
  const timeZone = credentials.timeZone || "Europe/Brussels";
  const locationDisplay = [input.locationName, input.locationAddress]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" — ");

  const attendees = (input.attendees ?? [])
    .map((guest) => {
      const address = guest.email.trim().toLowerCase();
      if (!address) return null;
      return {
        emailAddress: {
          address,
          ...(guest.name?.trim() ? { name: guest.name.trim() } : {}),
        },
        type: "required" as const,
      };
    })
    .filter((guest): guest is NonNullable<typeof guest> => Boolean(guest));

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.sellerEmail)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: input.subject,
        body: {
          contentType: "HTML",
          content: input.bodyHtml || "",
        },
        start: {
          dateTime: toGraphDateTime(input.date, input.start),
          timeZone,
        },
        end: {
          dateTime: toGraphDateTime(input.date, input.end),
          timeZone,
        },
        location: {
          displayName: locationDisplay || input.locationName,
        },
        ...(attendees.length > 0
          ? {
              attendees,
              responseRequested: true,
              allowNewTimeProposals: false,
            }
          : {}),
        isReminderOn: true,
        reminderMinutesBeforeStart: 15,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Graph event aanmaken mislukt (${response.status}): ${text}`,
    );
  }

  const data = (await response.json()) as { id?: string; webLink?: string };
  if (!data.id) {
    throw new Error("Graph event aanmaken mislukt: geen event-id");
  }

  return { id: data.id, webLink: data.webLink };
}

/** Check multiple hourly slots in one Graph call (window = earliest start → latest end). */
export async function checkHourlyAvailability(
  credentials: AzureCredentials,
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
  const windowStart = sorted[0].start;
  const windowEnd = sorted[sorted.length - 1].end;
  const timeZone = credentials.timeZone || "Europe/Brussels";
  const startMs = wallClockToUtcMs(date, windowStart, timeZone);
  const endMs = wallClockToUtcMs(date, windowEnd, timeZone);
  const durationMinutes = Math.max(
    60,
    Math.round((endMs - startMs) / 60_000),
  );

  const schedules = await getSchedules(
    credentials,
    uniqueEmails,
    date,
    windowStart,
    durationMinutes,
  );

  return uniqueEmails.map((email) => {
    const schedule = findSchedule(schedules, email);

    if (!schedule || schedule.error) {
      return {
        email,
        reachable: false,
        detail: schedule?.error?.message || schedule?.error?.responseCode,
        slots: slots.map((slot) => ({ ...slot, available: false })),
      };
    }

    return {
      email,
      reachable: true,
      slots: slots.map((slot) => {
        const slotStartMs = wallClockToUtcMs(date, slot.start, timeZone);
        const slotEndMs = wallClockToUtcMs(date, slot.end, timeZone);
        return {
          ...slot,
          available: !isScheduleBusy(schedule, slotStartMs, slotEndMs),
        };
      }),
    };
  });
}
