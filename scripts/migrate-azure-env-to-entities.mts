import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

function encryptSecret(plain: string, encryptionKey: string) {
  const key = createHash("sha256").update(encryptionKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

async function main() {
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  const tenantId = process.env.AZURE_TENANT_ID?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim();
  const timeZone =
    process.env.AZURE_TIMEZONE?.trim() || "Europe/Brussels";

  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("ENCRYPTION_KEY ontbreekt of is te kort");
  }
  if (!tenantId || !clientId || !clientSecret) {
    console.log("Geen volledige AZURE_* env gevonden; niets te migreren.");
    return;
  }

  const targets = await prisma.entity.findMany({
    where: {
      OR: [
        { calendarProvider: "NONE" },
        {
          calendarProvider: "OUTLOOK",
          outlookClientSecretEnc: null,
        },
      ],
    },
    select: { id: true, name: true, calendarProvider: true },
  });

  if (targets.length === 0) {
    console.log("Geen entiteiten zonder Outlook-secret; klaar.");
    return;
  }

  const secretEnc = encryptSecret(clientSecret, encryptionKey);
  let updated = 0;

  for (const entity of targets) {
    await prisma.entity.update({
      where: { id: entity.id },
      data: {
        calendarProvider: "OUTLOOK",
        calendarTimezone: timeZone,
        outlookTenantId: tenantId,
        outlookClientId: clientId,
        outlookClientSecretEnc: secretEnc,
      },
    });
    updated += 1;
    console.log(`Outlook-config gezet voor: ${entity.name}`);
  }

  console.log(`Klaar: ${updated} entiteit(en) bijgewerkt.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
