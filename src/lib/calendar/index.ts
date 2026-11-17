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
import {
  checkAvailabilityAt as googleCheckAvailabilityAt,
  checkCalendarVisibility as googleCheckCalendarVisibility,
  checkHourlyAvailability as googleCheckHourlyAvailability,
  createCalendarEvent as googleCreateCalendarEvent,
} from "../googleCalendar.js";
import { resolveCalendarConfig } from "./resolve.js";
import type { CalendarConfig } from "./types.js";

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
  if (config.provider === "GOOGLE") {
    return googleCheckCalendarVisibility(config, emails);
  }
  return outlookCheckCalendarVisibility(config, emails);
}

export async function checkAvailabilityAt(
  config: CalendarConfig,
  emails: string[],
  date: string,
  time: string,
  durationMinutes = 30,
): Promise<AvailabilityResult[]> {
  if (config.provider === "GOOGLE") {
    return googleCheckAvailabilityAt(
      config,
      emails,
      date,
      time,
      durationMinutes,
    );
  }
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
  if (config.provider === "GOOGLE") {
    return googleCheckHourlyAvailability(config, emails, date, slots);
  }
  return outlookCheckHourlyAvailability(config, emails, date, slots);
}

export async function createCalendarEvent(
  config: CalendarConfig,
  input: CreateCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  if (config.provider === "GOOGLE") {
    return googleCreateCalendarEvent(config, input);
  }
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
