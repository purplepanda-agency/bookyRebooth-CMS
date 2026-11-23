import { z } from "zod";
import {
  EXCEPTION_KINDS,
  EXCEPTION_REPEAT_UNITS,
  MAX_EXCEPTION_DATES,
  exceptionExceedsDateLimit,
  includedExceptionDates,
  isIsoDate,
  type ExceptionKind,
  type ExceptionRepeatUnit,
} from "../../lib/scheduleExceptions.js";

const weekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

const scheduleItemSchema = z.object({
  weekday: weekdaySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  locationId: z.string().cuid(),
});

const isoDateSchema = z
  .string()
  .refine(isIsoDate, "Datum moet JJJJ-MM-DD zijn");

const exceptionItemSchema = z.object({
  kind: z.enum(EXCEPTION_KINDS),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  repeatEvery: z.number().int().min(1).max(99),
  repeatUnit: z.enum(EXCEPTION_REPEAT_UNITS),
  excludedDates: z.array(isoDateSchema).default([]),
  startTime: timeSchema.nullable().optional(),
  endTime: timeSchema.nullable().optional(),
  locationId: z.string().cuid().nullable().optional(),
});

type ExceptionInput = {
  kind: ExceptionKind;
  startDate: string;
  endDate: string;
  repeatEvery: number;
  repeatUnit: ExceptionRepeatUnit;
  excludedDates: string[];
  startTime?: string | null;
  endTime?: string | null;
  locationId?: string | null;
};

function uniqueWeekdays(
  schedules: Array<{ weekday: string }>,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  for (const [index, item] of schedules.entries()) {
    if (seen.has(item.weekday)) {
      ctx.addIssue({
        code: "custom",
        path: ["schedules", index, "weekday"],
        message: "Elke weekdag mag maar één keer voorkomen",
      });
    }
    seen.add(item.weekday);
  }
}

function validTimeRanges(
  schedules: Array<{ startTime: string; endTime: string }>,
  ctx: z.RefinementCtx,
) {
  for (const [index, item] of schedules.entries()) {
    if (item.startTime >= item.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["schedules", index, "endTime"],
        message: "Eindtijd moet na starttijd liggen",
      });
    }
  }
}

function validExceptions(exceptions: ExceptionInput[], ctx: z.RefinementCtx) {
  for (const [index, item] of exceptions.entries()) {
    if (item.startDate > item.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["exceptions", index, "endDate"],
        message: "Einddatum moet op of na de begindatum liggen",
      });
      continue;
    }

    if (
      exceptionExceedsDateLimit({
        startDate: item.startDate,
        endDate: item.endDate,
        repeatEvery: item.repeatEvery,
        repeatUnit: item.repeatUnit,
      })
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["exceptions", index, "endDate"],
        message: `Een uitzondering mag maximaal ${MAX_EXCEPTION_DATES} dagen bevatten`,
      });
      continue;
    }

    const included = includedExceptionDates({
      startDate: item.startDate,
      endDate: item.endDate,
      repeatEvery: item.repeatEvery,
      repeatUnit: item.repeatUnit,
      excludedDates: item.excludedDates,
    });

    if (included.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["exceptions", index, "excludedDates"],
        message: "Een uitzondering moet minstens één datum bevatten",
      });
    }

    if (item.kind !== "WORKING") continue;

    if (!item.locationId) {
      ctx.addIssue({
        code: "custom",
        path: ["exceptions", index, "locationId"],
        message: "Een werkuitzondering heeft een locatie nodig",
      });
    }

    if (!item.startTime || !item.endTime || item.startTime >= item.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["exceptions", index, "endTime"],
        message: "Eindtijd moet na starttijd liggen",
      });
    }
  }
}

export const createSellerSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    imageUrl: z.string().min(1),
    active: z.boolean().optional().default(true),
    entityId: z.string().cuid().optional(),
    primaryLocationId: z.string().cuid(),
    categoryIds: z.array(z.string().cuid()).default([]),
    schedules: z.array(scheduleItemSchema).default([]),
    exceptions: z.array(exceptionItemSchema).default([]),
  })
  .superRefine((data, ctx) => {
    uniqueWeekdays(data.schedules, ctx);
    validTimeRanges(data.schedules, ctx);
    validExceptions(data.exceptions, ctx);
  });

export const updateSellerSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    imageUrl: z.string().min(1),
    active: z.boolean(),
    primaryLocationId: z.string().cuid(),
    categoryIds: z.array(z.string().cuid()).default([]),
    schedules: z.array(scheduleItemSchema).default([]),
    exceptions: z.array(exceptionItemSchema).default([]),
  })
  .superRefine((data, ctx) => {
    uniqueWeekdays(data.schedules, ctx);
    validTimeRanges(data.schedules, ctx);
    validExceptions(data.exceptions, ctx);
  });
