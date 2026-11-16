import type { AuthUser } from "../types/express.js";

export type EntityScopeError = { error: string; status: number };

export type EntityScopeOk = {
  entityId?: string;
  entityIds?: string[];
};

function requestedId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function canAccessEntity(user: AuthUser, entityId: string) {
  if (user.role === "SUPER_ADMIN") return true;
  return user.entityIds.includes(entityId);
}

export function prismaEntityWhere(scope: EntityScopeOk) {
  if (scope.entityId) return { entityId: scope.entityId };
  if (scope.entityIds && scope.entityIds.length > 0) {
    return { entityId: { in: scope.entityIds } };
  }
  return undefined;
}

export function resolveEntityIdForWrite(
  user: AuthUser,
  requestedEntityId?: string | null,
): { entityId: string } | EntityScopeError {
  const requested = requestedId(requestedEntityId);

  if (user.role === "ADMIN") {
    if (user.entityIds.length === 0) {
      return { error: "Admin is niet gekoppeld aan een entiteit", status: 403 };
    }

    if (user.entityIds.length === 1) {
      const only = user.entityIds[0]!;
      if (requested && requested !== only) {
        return { error: "Geen toegang tot deze entiteit", status: 403 };
      }
      return { entityId: only };
    }

    if (!requested) {
      return { error: "entityId is verplicht", status: 400 };
    }

    if (!user.entityIds.includes(requested)) {
      return { error: "Geen toegang tot deze entiteit", status: 403 };
    }

    return { entityId: requested };
  }

  if (!requested) {
    return { error: "entityId is verplicht", status: 400 };
  }

  return { entityId: requested };
}

export function resolveEntityFilter(
  user: AuthUser,
  queryEntityId?: string | null,
): EntityScopeOk | EntityScopeError {
  const requested = requestedId(queryEntityId);

  if (user.role === "ADMIN") {
    if (user.entityIds.length === 0) {
      return { error: "Admin is niet gekoppeld aan een entiteit", status: 403 };
    }

    if (requested) {
      if (!user.entityIds.includes(requested)) {
        return { error: "Geen toegang tot deze entiteit", status: 403 };
      }
      return { entityId: requested };
    }

    if (user.entityIds.length === 1) {
      return { entityId: user.entityIds[0] };
    }

    return { entityIds: user.entityIds };
  }

  if (requested) {
    return { entityId: requested };
  }

  return {};
}
