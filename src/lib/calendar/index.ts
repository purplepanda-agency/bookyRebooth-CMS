import {
  checkAvailabilityAt as outlookCheckAvailabilityAt,
  checkCalendarVisibility as outlookCheckCalendarVisibility,
  checkHourlyAvailability as outlookCheckHourlyAvailability,
  createCalendarEvent as outlookCreateCalendarEvent,
  type AvailabilityResult,
  type CalendarReachability,
  type CreateCalendarEventInput,
  type CreateCalendarEventResult,
  type HourlyAvailability,
  type HourlySlot,
} from "../azureGraph.js";
import { resolveCalendarConfig } from "./resolve.js";
import type { CalendarConfig } from "./types.js";

function googleNotReady(): never {
  throw new Error(
    "Google Calendar is nog niet actief. Kies Outlook of wacht op de Google-implementatie.",
  );
}

export async function getEntityCalendarConfig(entityId: string) {
  return resolveCalendarConfig(entityId);
}

export function isCalendarConfigured(config: CalendarConfig | null | undefined) {
  return Boolean(config);
}

export async function checkCalendarVisibility(
  config: CalendarConfig,
  emails: string[],
): Promise<CalendarReachability[]> {
  if (config.provider === "GOOGLE") googleNotReady();
  return outlookCheckCalendarVisibility(config, emails);
}

export async function checkAvailabilityAt(
  config: CalendarConfig,
  emails: string[],
  date: string,
  time: string,
  durationMinutes = 30,
): Promise<AvailabilityResult[]> {
  if (config.provider === "GOOGLE") googleNotReady();
  return outlookCheckAvailabilityAt(
    config,
    emails,
    date,
    time,
    durationMinutes,
  );
}

export async function checkHourlyAvailability(
  config: CalendarConfig,
  emails: string[],
  date: string,
  slots: HourlySlot[],
): Promise<HourlyAvailability[]> {
  if (config.provider === "GOOGLE") googleNotReady();
  return outlookCheckHourlyAvailability(config, emails, date, slots);
}

export async function createCalendarEvent(
  config: CalendarConfig,
  input: CreateCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  if (config.provider === "GOOGLE") googleNotReady();
  return outlookCreateCalendarEvent(config, input);
}

export type {
  AvailabilityResult,
  CalendarReachability,
  CreateCalendarEventInput,
  CreateCalendarEventResult,
  HourlyAvailability,
  HourlySlot,
};
