import { z } from "zod";

const buttonUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      /^https?:\/\//i.test(value) ||
      value.startsWith("/") ||
      value.startsWith("#"),
    "Ongeldige knop-URL",
  );

export const contentBlockButtonSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: buttonUrlSchema,
});

export const createContentBlockSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
  buttons: z.array(contentBlockButtonSchema).max(10).default([]),
  active: z.boolean().optional().default(true),
  stepIds: z.array(z.string().cuid()).default([]),
  entityId: z.string().cuid().optional(),
});

export const updateContentBlockSchema = createContentBlockSchema;

export const patchContentBlockActiveSchema = z.object({
  active: z.boolean(),
});
