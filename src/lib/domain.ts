/** Normalize host/domain values for comparison (strip protocol, path, port, www). */
export function normalizeHost(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]!
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

export function isLocalHost(host: string) {
  const normalized = normalizeHost(host);
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".localhost")
  );
}

export type EntityHostMatch = {
  slug: string;
  domain: string | null;
  active: boolean;
};

/**
 * Pick the active entity whose configured domain equals the incoming host.
 * Empty domains never match. Localhost is not a stored domain.
 */
export function matchEntityByHost(
  entities: EntityHostMatch[],
  host: string | null | undefined,
): { slug: string } | { error: string; status: 404 | 409 } {
  if (!host?.trim()) {
    return { error: "Host ontbreekt voor domeincontrole", status: 404 };
  }

  const incoming = normalizeHost(host);
  const matches = entities.filter(
    (entity) =>
      entity.active &&
      !!entity.domain?.trim() &&
      normalizeHost(entity.domain) === incoming,
  );

  if (matches.length === 1) return { slug: matches[0]!.slug };
  if (matches.length > 1) {
    return { error: "Meerdere entiteiten gebruiken dit domein", status: 409 };
  }
  return { error: "Geen entiteit gevonden voor dit domein", status: 404 };
}

export function findDomainConflict(
  entities: Array<{ id: string; name: string; domain: string | null }>,
  domain: string | null | undefined,
  exceptEntityId?: string,
): { id: string; name: string } | null {
  if (!domain?.trim()) return null;
  const incoming = normalizeHost(domain);
  if (!incoming) return null;

  return (
    entities.find(
      (entity) =>
        entity.id !== exceptEntityId &&
        !!entity.domain?.trim() &&
        normalizeHost(entity.domain) === incoming,
    ) ?? null
  );
}

/**
 * Returns null when allowed, otherwise an error message.
 * Empty configured domain = no restriction (useful during setup).
 * Localhost is always allowed for development.
 */
export function assertHostAllowed(
  configuredDomain: string | null | undefined,
  requestHost: string | null | undefined,
): string | null {
  if (!configuredDomain?.trim()) return null;
  if (!requestHost?.trim()) {
    return "Host ontbreekt voor domeincontrole";
  }
  if (isLocalHost(requestHost)) return null;

  const allowed = normalizeHost(configuredDomain);
  const incoming = normalizeHost(requestHost);
  if (allowed !== incoming) {
    return "Dit domein hoort niet bij deze entiteit";
  }
  return null;
}
