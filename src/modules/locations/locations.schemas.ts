import { z } from "zod";

const permalinkSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Permalink must be lowercase kebab-case");

/** Leeg toegestaan; ingevuld moet een geldige URL zijn. */
const optionalGoogleMapsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => value.length === 0 || z.string().url().safeParse(value).success,
    { message: "Ongeldige Google Maps-link" },
  );

export const createLocationSchema = z.object({
  name: z.string().min(1).max(120),
  imageUrl: z.string().min(1).nullable().optional(),
  address: z.string().min(1).max(255),
  googleMapsUrl: optionalGoogleMapsUrl.default(""),
  phone: z.string().min(1).max(50),
  email: z.string().email(),
  permalink: permalinkSchema,
  entityId: z.string().cuid().optional(),
});

export const updateLocationSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    imageUrl: z.string().min(1).nullable().optional(),
    address: z.string().min(1).max(255).optional(),
    googleMapsUrl: optionalGoogleMapsUrl.optional(),
    phone: z.string().min(1).max(50).optional(),
    email: z.string().email().optional(),
    permalink: permalinkSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
