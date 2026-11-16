import { z } from "zod";

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case");

const domainSchema = z
  .string()
  .max(255)
  .transform((value) => {
    const cleaned = value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]!
      .replace(/^www\./, "");
    return cleaned;
  })
  .refine(
    (value) => value === "" || /^[a-z0-9.-]+(?::\d+)?$/.test(value),
    "Ongeldig domein",
  );

export const createEntitySchema = z.object({
  name: z.string().min(2).max(120),
  slug: slugSchema,
  domain: domainSchema.optional(),
  active: z.boolean().optional().default(true),
  maintenanceMode: z.boolean().optional().default(false),
});

export const updateEntitySchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    slug: slugSchema.optional(),
    domain: domainSchema.nullable().optional(),
    active: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
