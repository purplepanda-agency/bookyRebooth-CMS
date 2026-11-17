import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet YYYY-MM-DD zijn");

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Tijd moet HH:MM zijn");

export const publicAvailabilitySlotsSchema = z.object({
  location: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
  date: dateSchema,
  dayStartHour: z.number().int().min(0).max(23).optional().default(10),
});

export const publicTrackEventSchema = z.object({
  type: z.literal("NOT_FOUND_404"),
  message: z.string().trim().max(500).optional(),
});

export const publicCreateBookingSchema = z.object({
  location: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
  date: dateSchema,
  start: timeSchema,
  end: timeSchema,
  sellerId: z.string().min(1).max(64).nullable(),
  productName: z.string().max(200).nullable().optional(),
  flowSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((value) => value.toLowerCase())
    .optional(),
  privacyAccepted: z.literal(true),
  recaptchaToken: z.string().min(1).max(4000),
  customer: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(1).max(40),
    email: z.string().trim().email().max(160),
    address: z.string().trim().max(255).optional().default(""),
    currentVehicle: z.string().trim().max(160).optional().default(""),
    extraInfo: z.string().trim().max(2000).optional().default(""),
  }),
});
