import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      passwordHash,
      role: Role.SUPER_ADMIN,
    },
    create: {
      email: adminEmail.toLowerCase(),
      passwordHash,
      role: Role.SUPER_ADMIN,
    },
  });

  await prisma.userEntity.deleteMany({ where: { userId: admin.id } });

  console.log(`Super admin ready: ${admin.email}`);

  if (process.env.SEED_DEMO !== "true") {
    return;
  }

  const entityName = process.env.SEED_DEMO_ENTITY_NAME ?? "Demo Dealer";
  const entitySlug = process.env.SEED_DEMO_ENTITY_SLUG ?? "demo-dealer";
  const demoEmail = process.env.SEED_DEMO_ADMIN_EMAIL;
  const demoPassword = process.env.SEED_DEMO_ADMIN_PASSWORD;

  if (!demoEmail || !demoPassword) {
    throw new Error(
      "SEED_DEMO=true requires SEED_DEMO_ADMIN_EMAIL and SEED_DEMO_ADMIN_PASSWORD",
    );
  }

  const entity = await prisma.entity.upsert({
    where: { slug: entitySlug },
    update: { name: entityName, active: true },
    create: {
      name: entityName,
      slug: entitySlug,
      active: true,
    },
  });

  const demoHash = await bcrypt.hash(demoPassword, 12);

  const demoAdmin = await prisma.user.upsert({
    where: { email: demoEmail.toLowerCase() },
    update: {
      passwordHash: demoHash,
      role: Role.ADMIN,
    },
    create: {
      email: demoEmail.toLowerCase(),
      passwordHash: demoHash,
      role: Role.ADMIN,
    },
  });

  await prisma.userEntity.upsert({
    where: {
      userId_entityId: { userId: demoAdmin.id, entityId: entity.id },
    },
    update: {},
    create: { userId: demoAdmin.id, entityId: entity.id },
  });

  console.log(`Demo entity ready: ${entity.slug}`);
  console.log(`Admin ready: ${demoAdmin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
