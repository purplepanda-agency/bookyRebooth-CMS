import { z } from "zod";

const freeChoiceOptionSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  imageUrl: z.string().min(1).nullable().optional(),
});

const freeChoiceConfigSchema = z.object({
  options: z.array(freeChoiceOptionSchema).min(1),
});

const stepTitleSchema = z
  .string()
  .max(200)
  .optional()
  .transform((value) => (value ?? "").trim());

const productSetConfigSchema = z
  .object({
    title: stepTitleSchema,
    productSetId: z.string().cuid(),
    allowNoProduct: z.boolean().optional().default(false),
    noProductTitle: z
      .string()
      .max(120)
      .optional()
      .transform((value) => (value ?? "").trim()),
    noProductImageUrl: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.allowNoProduct && !value.noProductTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Titel voor ‘geen keuze’ is verplicht",
        path: ["noProductTitle"],
      });
    }
  });

const imageFitSchema = z.enum(["contain", "cover"]).optional().default("contain");

const locationsConfigSchema = z.object({
  title: stepTitleSchema,
  locationIds: z.array(z.string().cuid()).min(1),
  showImage: z.boolean().optional().default(true),
  imageFit: imageFitSchema,
});

const categoriesConfigSchema = z.object({
  title: stepTitleSchema,
  categoryIds: z.array(z.string().cuid()).min(1),
  showImage: z.boolean().optional().default(true),
  imageFit: imageFitSchema,
});

const sellersAgendaConfigSchema = z.object({}).strict();

const webhookUrlSchema = z
  .string()
  .max(2000)
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (!value) return;
    const parsed = z.string().url().safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ongeldige webhook-URL",
      });
    }
  });

const webhookPayloadSchema = z.record(z.string(), z.unknown());

const webhookEntrySchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z
    .string()
    .max(120)
    .optional()
    .transform((value) => (value ?? "").trim()),
  url: webhookUrlSchema,
  payload: webhookPayloadSchema.optional().nullable(),
});

const confirmationConfigSchema = z.object({
  title: stepTitleSchema,
  webhooks: z.array(webhookEntrySchema).optional().default([]),
  // Legacy single-webhook velden (spiegel van webhooks[0]) voor oudere booking-runners
  webhookUrl: z
    .string()
    .max(2000)
    .optional()
    .transform((value) => (value ?? "").trim()),
  webhookName: z
    .string()
    .max(120)
    .optional()
    .transform((value) => (value ?? "").trim()),
  webhookPayload: webhookPayloadSchema.optional().nullable(),
});

const optionalStepId = z.string().cuid().optional();

const stepSchema = z.discriminatedUnion("type", [
  z.object({
    id: optionalStepId,
    type: z.literal("FREE_CHOICE"),
    config: freeChoiceConfigSchema,
  }),
  z.object({
    id: optionalStepId,
    type: z.literal("PRODUCT_SET"),
    config: productSetConfigSchema,
  }),
  z.object({
    id: optionalStepId,
    type: z.literal("LOCATIONS"),
    config: locationsConfigSchema,
  }),
  z.object({
    id: optionalStepId,
    type: z.literal("CATEGORIES"),
    config: categoriesConfigSchema,
  }),
  z.object({
    id: optionalStepId,
    type: z.literal("SELLERS_AGENDA"),
    config: sellersAgendaConfigSchema,
  }),
  z.object({
    id: optionalStepId,
    type: z.literal("CONFIRMATION"),
    config: confirmationConfigSchema,
  }),
]);

const slugSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case");

export const createFlowSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  featuredImage: z.string().min(1).nullable().optional(),
  active: z.boolean().optional().default(true),
  entityId: z.string().cuid().optional(),
  steps: z.array(stepSchema).default([]),
});

export const updateFlowSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  featuredImage: z.string().min(1).nullable().optional(),
  active: z.boolean(),
  steps: z.array(stepSchema),
});

export const patchFlowActiveSchema = z.object({
  active: z.boolean(),
});

export const reorderFlowsSchema = z.object({
  orderedIds: z.array(z.string().cuid()).min(1),
  entityId: z.string().cuid().optional(),
});
