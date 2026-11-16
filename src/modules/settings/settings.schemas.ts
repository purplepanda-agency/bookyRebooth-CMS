import { z } from "zod";

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

const hexColorSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Ongeldige kleur"),
    z.literal(""),
    z.null(),
  ])
  .transform((value) => {
    if (!value) return null;
    const hex = value.toLowerCase();
    if (hex.length === 4) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return hex;
  });

export const updateDomainSettingsSchema = z.object({
  domain: domainSchema,
  entityId: z.string().cuid().optional(),
});

export const updateContentSettingsSchema = z.object({
  logoUrl: z.string().min(1).nullable(),
  introText: z.string().max(500).nullable(),
  emailExtraTxt: z.string().max(50_000).nullable(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  entityId: z.string().cuid().optional(),
});

const gtmIdSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^GTM-[A-Z0-9]+$/i, "GTM ID moet het formaat GTM-XXXXXXX hebben"),
    z.literal(""),
    z.null(),
  ])
  .transform((value) => {
    if (!value) return null;
    return value.trim().toUpperCase();
  });

export const updateTrackingSettingsSchema = z.object({
  gtmId: gtmIdSchema,
  headerScripts: z.string().max(100_000).nullable(),
  footerScripts: z.string().max(100_000).nullable(),
  entityId: z.string().cuid().optional(),
});

const optionalTrimmed = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  });

export const updateCalendarSettingsSchema = z
  .object({
    provider: z.enum(["NONE", "OUTLOOK", "GOOGLE"]),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .default("Europe/Brussels"),
    outlookTenantId: optionalTrimmed,
    outlookClientId: optionalTrimmed,
    outlookClientSecret: optionalTrimmed,
    clearOutlookClientSecret: z.boolean().optional(),
    googleClientEmail: optionalTrimmed,
    googlePrivateKey: optionalTrimmed,
    clearGooglePrivateKey: z.boolean().optional(),
    googleSubject: optionalTrimmed,
    entityId: z.string().cuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "OUTLOOK") {
      if (!value.outlookTenantId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Outlook tenant ID is verplicht",
          path: ["outlookTenantId"],
        });
      }
      if (!value.outlookClientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Outlook client ID is verplicht",
          path: ["outlookClientId"],
        });
      }
    }
    if (value.provider === "GOOGLE") {
      if (!value.googleClientEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Google client e-mail is verplicht",
          path: ["googleClientEmail"],
        });
      }
    }
  });
