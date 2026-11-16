import { z } from "zod";

const optionalLabel = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 120) : null;
  });

const optionalUrl = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  })
  .refine(
    (value) =>
      value == null ||
      /^https?:\/\//i.test(value) ||
      value.startsWith("/") ||
      value.startsWith("#"),
    "Ongeldige knop-URL",
  );

export const createContentBlockSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(10_000),
    buttonLabel: optionalLabel,
    buttonUrl: optionalUrl,
    active: z.boolean().optional().default(true),
    stepIds: z.array(z.string().cuid()).default([]),
    entityId: z.string().cuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.buttonLabel && !value.buttonUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Knop-URL is verplicht als er een knoplabel is",
        path: ["buttonUrl"],
      });
    }
    if (value.buttonUrl && !value.buttonLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Knoplabel is verplicht als er een knop-URL is",
        path: ["buttonLabel"],
      });
    }
  });

export const updateContentBlockSchema = createContentBlockSchema;
