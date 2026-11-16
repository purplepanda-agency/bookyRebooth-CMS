import type { Weekday } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  checkHourlyAvailability,
  getEntityCalendarConfig,
  type HourlySlot,
} from "../../lib/calendar/index.js";

const JS_DAY_TO_WEEKDAY: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Starts every `stepMinutes` (default 30), each appointment lasts
 * `appointmentMinutes` (default 60).
 */
export function buildHourlySlots(
  workStart: string,
  workEnd: string,
  dayStartHour: number,
  stepMinutes = 30,
  appointmentMinutes = 60,
): HourlySlot[] {
  const step = Math.max(15, stepMinutes);
  const duration = Math.max(step, appointmentMinutes);
  const dayStart = dayStartHour * 60;
  let slotStart = Math.max(dayStart, timeToMinutes(workStart));
  if (slotStart % step !== 0) {
    slotStart = Math.ceil(slotStart / step) * step;
  }
  const end = timeToMinutes(workEnd);
  const slots: HourlySlot[] = [];

  while (slotStart + duration <= end) {
    slots.push({
      start: minutesToTime(slotStart),
      end: minutesToTime(slotStart + duration),
    });
    slotStart += step;
  }

  return slots;
}

export type AvailabilitySlotsInput = {
  entityId: string;
  location: string;
  category: string;
  date: string;
  dayStartHour?: number;
};

export type AvailabilitySlotsResult = {
  date: string;
  weekday: Weekday;
  dayStartHour: number;
  location: {
    id: string;
    name: string;
    permalink: string;
    address: string;
    imageUrl: string | null;
  };
  category: { id: string; name: string; slug: string };
  sellers: Array<{
    sellerId: string;
    name: string;
    email: string;
    imageUrl: string;
    workSchedule: {
      weekday: Weekday;
      startTime: string;
      endTime: string;
    };
    calendarReachable: boolean;
    calendarDetail?: string;
    slots: Array<{
      start: string;
      end: string;
      label: string;
      available: boolean;
    }>;
    availableSlots: string[];
  }>;
};

export async function getAvailabilitySlots(
  input: AvailabilitySlotsInput,
): Promise<
  | { ok: true; data: AvailabilitySlotsResult }
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

  const dayStartHour = input.dayStartHour ?? 10;
  const locationPermalink = input.location.trim().toLowerCase();
  const categorySlug = input.category.trim().toLowerCase();

  const location = await prisma.location.findFirst({
    where: {
      permalink: locationPermalink,
      entityId: input.entityId,
    },
    select: {
      id: true,
      name: true,
      permalink: true,
      address: true,
      imageUrl: true,
      entityId: true,
    },
  });

  if (!location) {
    return {
      ok: false,
      status: 404,
      error: `Locatie '${input.location}' niet gevonden`,
    };
  }

  const category = await prisma.category.findFirst({
    where: {
      slug: categorySlug,
      entityId: location.entityId,
    },
    select: { id: true, name: true, slug: true },
  });

  if (!category) {
    return {
      ok: false,
      status: 404,
      error: `Categorie '${input.category}' niet gevonden`,
    };
  }

  const weekday = JS_DAY_TO_WEEKDAY[new Date(`${input.date}T12:00:00`).getDay()];

  const sellers = await prisma.seller.findMany({
    where: {
      active: true,
      entityId: location.entityId,
      categories: { some: { id: category.id } },
      schedules: {
        some: {
          weekday,
          locationId: location.id,
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      schedules: {
        where: {
          weekday,
          locationId: location.id,
        },
        select: {
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  const sellersWithSlots = sellers
    .map((seller) => {
      const work = seller.schedules[0];
      if (!work) return null;
      const candidateSlots = buildHourlySlots(
        work.startTime,
        work.endTime,
        dayStartHour,
      );
      return {
        sellerId: seller.id,
        name: seller.name,
        email: seller.email,
        imageUrl: seller.imageUrl,
        workSchedule: {
          weekday,
          startTime: work.startTime,
          endTime: work.endTime,
        },
        candidateSlots,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const allCandidateSlots = [
    ...new Map(
      sellersWithSlots
        .flatMap((seller) => seller.candidateSlots)
        .map((slot) => [`${slot.start}-${slot.end}`, slot]),
    ).values(),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const calendar =
    sellersWithSlots.length === 0 || allCandidateSlots.length === 0
      ? []
      : await checkHourlyAvailability(
          calendarConfig.config,
          sellersWithSlots.map((seller) => seller.email),
          input.date,
          allCandidateSlots,
        );

  const byEmail = new Map(
    calendar.map((item) => [item.email.toLowerCase(), item]),
  );

  const results = sellersWithSlots.map((seller) => {
    const match = byEmail.get(seller.email.toLowerCase());
    const slotLookup = new Map(
      (match?.slots ?? []).map((slot) => [
        `${slot.start}-${slot.end}`,
        slot.available,
      ]),
    );

    const slots = seller.candidateSlots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      label: `${slot.start} - ${slot.end}`,
      available: Boolean(slotLookup.get(`${slot.start}-${slot.end}`)),
    }));

    return {
      sellerId: seller.sellerId,
      name: seller.name,
      email: seller.email,
      imageUrl: seller.imageUrl,
      workSchedule: seller.workSchedule,
      calendarReachable: match?.reachable ?? false,
      calendarDetail: match?.detail,
      slots,
      availableSlots: slots
        .filter((slot) => slot.available)
        .map((slot) => slot.label),
    };
  });

  return {
    ok: true,
    data: {
      date: input.date,
      weekday,
      dayStartHour,
      location: {
        id: location.id,
        name: location.name,
        permalink: location.permalink,
        address: location.address,
        imageUrl: location.imageUrl,
      },
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      sellers: results,
    },
  };
}
