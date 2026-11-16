import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  ENCRYPTION_KEY: z.string().min(32),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_DEMO: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SEED_DEMO_ENTITY_NAME: z.string().default("Demo Dealer"),
  SEED_DEMO_ENTITY_SLUG: z.string().default("demo-dealer"),
  SEED_DEMO_ADMIN_EMAIL: z.string().email().optional(),
  SEED_DEMO_ADMIN_PASSWORD: z.string().min(8).optional(),
  AZURE_TENANT_ID: optionalString,
  AZURE_CLIENT_ID: optionalString,
  AZURE_CLIENT_SECRET: optionalString,
  AZURE_TIMEZONE: z.string().default("Europe/Brussels"),
  SENDGRID_API_KEY: optionalString,
  SENDGRID_FROM_EMAIL: optionalString,
  SENDGRID_FROM_NAME: optionalString,
  SENDGRID_BOOKING_TEMPLATE_ID: optionalString,
  PUBLIC_BASE_URL: optionalString,
  RECAPTCHA_SECRET_KEY: optionalString,
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
