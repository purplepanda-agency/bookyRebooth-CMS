import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { EntitySummary } from "../api/types";
import { useAuth } from "./AuthContext";

export function useAccessibleEntities() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const assigned = user?.entities ?? [];
  const assignedKey = assigned.map((entity) => entity.id).join("|");
  const [catalog, setCatalog] = useState<EntitySummary[]>(assigned);
  const [loadingEntities, setLoadingEntities] = useState(isSuper);

  useEffect(() => {
    if (!isSuper) {
      setCatalog(assigned);
      setLoadingEntities(false);
      return;
    }

    let cancelled = false;
    setLoadingEntities(true);

    api<{ entities: EntitySummary[] }>("/entities")
      .then((data) => {
        if (!cancelled) setCatalog(data.entities);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEntities(false);
      });

    return () => {
      cancelled = true;
    };
    // assignedKey tracks the assigned entity set without changing identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper, user?.id, assignedKey]);

  const entities = isSuper ? catalog : assigned;
  const canChooseEntity = isSuper || entities.length > 1;
  const fixedEntity = !isSuper && entities.length === 1 ? entities[0] : null;

  return {
    user,
    isSuper,
    entities,
    canChooseEntity,
    fixedEntity,
    loadingEntities,
  };
}
