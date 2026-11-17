import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet YYYY-MM-DD zijn");

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Tijd moet HH:mm zijn");

export const sellerConnectionsQuerySchema = z.object({
  entityId: z.string().cuid().optional(),
});

export const availabilityTestSchema = z.object({
  entityId: z.string().cuid().optional(),
  date: dateSchema,
  time: timeSchema,
  durationMinutes: z.number().int().min(5).max(240).optional().default(30),
});

export const availabilityCheckSchema = z.object({
  sellerId: z.string().cuid().optional(),
  sellerIds: z.array(z.string().cuid()).optional(),
  entityId: z.string().cuid().optional(),
  date: dateSchema,
  time: timeSchema,
  durationMinutes: z.number().int().min(5).max(240).optional().default(30),
});

const optionalSlug = z
  .string()
  .max(120)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim() || "";
    return trimmed || null;
  });

export const availabilitySlotsSchema = z.object({
  entityId: z.string().cuid().optional(),
  location: optionalSlug,
  category: optionalSlug,
  date: dateSchema,
  dayStartHour: z.number().int().min(0).max(23).optional().default(10),
});
