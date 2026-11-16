import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";
import type { EntitySummary } from "../api/types";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "booky.activeEntityId";

export type EntityPhase = "steady" | "out" | "hold" | "in";

const FADE_OUT_MS = 180;
const FADE_IN_FALLBACK_MS = 240;

type EntityScope = {
  user: ReturnType<typeof useAuth>["user"];
  isSuper: boolean;
  entities: EntitySummary[];
  canChooseEntity: boolean;
  fixedEntity: EntitySummary | null;
  loadingEntities: boolean;
  /** Entity the open screen is showing. Updates after the fade-out. */
  selectedEntityId: string;
  selectedEntity: EntitySummary | null;
  /** Entity chosen in the dropdown. Updates immediately. */
  entityChoiceId: string;
  entityPhase: EntityPhase;
  setSelectedEntityId: (entityId: string) => void;
  settleEntityTransition: () => void;
};

const EntityScopeContext = createContext<EntityScope | null>(null);

function readStoredEntityId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function useAccessibleEntitiesState() {
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
  const canChooseEntity = entities.length > 1;
  const fixedEntity = entities.length === 1 ? entities[0] : null;

  return {
    user,
    isSuper,
    entities,
    canChooseEntity,
    fixedEntity,
    loadingEntities,
  };
}

function persistEntityId(entityId: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, entityId);
  } catch {
    /* session storage can be unavailable */
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function EntityScopeProvider({ children }: { children: ReactNode }) {
  const access = useAccessibleEntitiesState();
  const storedEntityId = readStoredEntityId();
  const [choiceEntityId, setChoiceEntityId] = useState(storedEntityId);
  const [committedEntityId, setCommittedEntityId] = useState(storedEntityId);
  const [entityPhase, setEntityPhase] = useState<EntityPhase>("steady");
  const generationRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const phaseRef = useRef<EntityPhase>("steady");
  const committedRef = useRef(storedEntityId);
  phaseRef.current = entityPhase;
  committedRef.current = committedEntityId;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const assignEntity = useCallback(
    (entityId: string, animate: boolean) => {
      setChoiceEntityId(entityId);
      persistEntityId(entityId);
      if (animate && entityId === committedRef.current) return;

      clearTimers();
      generationRef.current += 1;
      const generation = generationRef.current;

      if (!animate || prefersReducedMotion()) {
        setCommittedEntityId(entityId);
        setEntityPhase("steady");
        return;
      }

      setEntityPhase("out");
      const outTimer = window.setTimeout(() => {
        setCommittedEntityId(entityId);
        setEntityPhase("hold");
        const fallbackTimer = window.setTimeout(() => {
          if (generationRef.current !== generation) return;
          setEntityPhase("in");
        }, FADE_IN_FALLBACK_MS);
        timersRef.current.push(fallbackTimer);
      }, FADE_OUT_MS);
      timersRef.current.push(outTimer);
    },
    [clearTimers],
  );

  const setSelectedEntityId = useCallback(
    (entityId: string) => assignEntity(entityId, true),
    [assignEntity],
  );

  const settleEntityTransition = useCallback(() => {
    if (phaseRef.current !== "hold") return;
    generationRef.current += 1;
    setEntityPhase("in");
  }, []);

  useEffect(() => {
    if (access.entities.length === 0) return;
    const valid = access.entities.some(
      (entity) => entity.id === committedEntityId,
    );
    if (valid) return;
    const next = access.entities[0]?.id ?? "";
    if (next) assignEntity(next, false);
  }, [access.entities, committedEntityId, assignEntity]);

  const resolvedEntityId = access.entities.some(
    (entity) => entity.id === committedEntityId,
  )
    ? committedEntityId
    : (access.entities[0]?.id ?? "");
  const selectedEntity =
    access.entities.find((entity) => entity.id === resolvedEntityId) ?? null;
  const entityChoiceId = access.entities.some(
    (entity) => entity.id === choiceEntityId,
  )
    ? choiceEntityId
    : resolvedEntityId;

  const value = useMemo<EntityScope>(
    () => ({
      user: access.user,
      isSuper: access.isSuper,
      entities: access.entities,
      canChooseEntity: access.canChooseEntity,
      fixedEntity: access.fixedEntity,
      loadingEntities: access.loadingEntities,
      selectedEntityId: selectedEntity?.id ?? "",
      selectedEntity,
      entityChoiceId,
      entityPhase,
      setSelectedEntityId,
      settleEntityTransition,
    }),
    [
      access.user,
      access.isSuper,
      access.entities,
      access.canChooseEntity,
      access.fixedEntity,
      access.loadingEntities,
      selectedEntity,
      entityChoiceId,
      entityPhase,
      setSelectedEntityId,
      settleEntityTransition,
    ],
  );

  return createElement(EntityScopeContext.Provider, { value }, children);
}

export function useAccessibleEntities() {
  const scope = useContext(EntityScopeContext);
  if (!scope) {
    throw new Error("useAccessibleEntities must be used within EntityScopeProvider");
  }
  return scope;
}
