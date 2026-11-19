import { findDomainConflict } from "./domain.js";
import { prisma } from "./prisma.js";

/** Null when the domain is empty or still free. Inactive entities count as in use. */
export async function domainInUseError(
  domain: string | null | undefined,
  exceptEntityId?: string,
): Promise<string | null> {
  if (!domain?.trim()) return null;

  const entities = await prisma.entity.findMany({
    select: { id: true, name: true, domain: true },
  });
  const conflict = findDomainConflict(entities, domain, exceptEntityId);
  if (!conflict) return null;
  return `Dit domein is al gekoppeld aan ${conflict.name}.`;
}
