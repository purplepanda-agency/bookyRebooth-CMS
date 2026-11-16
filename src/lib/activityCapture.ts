import {
  activityStorage,
  noteActivity,
  type ActivityOperation,
} from "./activityContext.js";

const WRITE_OPS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

const SKIP_MODELS = new Set(["AnalyticsEvent", "ActivityLog"]);

const IGNORED_FIELDS = new Set(["updatedAt", "createdAt"]);

const LABEL_KEYS = ["name", "title", "email", "slug", "permalink"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOperation(operation: string): ActivityOperation {
  if (operation === "create" || operation === "createMany") return "create";
  if (operation === "delete" || operation === "deleteMany") return "delete";
  return "update";
}

function collectFields(data: unknown): string[] {
  if (Array.isArray(data)) {
    const fields = new Set<string>();
    for (const row of data) {
      for (const field of collectFields(row)) fields.add(field);
    }
    return [...fields];
  }

  if (!isRecord(data)) return [];

  return Object.keys(data).filter((key) => !IGNORED_FIELDS.has(key));
}

function readLabel(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of LABEL_KEYS) {
    const label = value[key];
    if (typeof label === "string" && label.trim()) return label.trim();
  }
  return null;
}

function readId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return value.id;
}

function addEntity(
  ids: string[],
  names: Map<string, string>,
  id: string,
  name?: string | null,
) {
  if (!ids.includes(id)) ids.push(id);
  if (name && !names.has(id)) names.set(id, name);
}

function harvestEntityList(
  value: unknown,
  ids: string[],
  names: Map<string, string>,
) {
  if (Array.isArray(value)) {
    for (const item of value) harvestEntityList(item, ids, names);
    return;
  }

  if (!isRecord(value)) return;

  if (typeof value.entityId === "string") addEntity(ids, names, value.entityId);
  if (typeof value.id === "string" && !("entityId" in value)) {
    addEntity(
      ids,
      names,
      value.id,
      typeof value.name === "string" ? value.name : null,
    );
  }

  for (const key of ["create", "connect", "set"] as const) {
    if (key in value) harvestEntityList(value[key], ids, names);
  }
}

function harvestWrite(
  value: unknown,
  ids: string[],
  names: Map<string, string>,
  userIds: string[],
) {
  if (Array.isArray(value)) {
    for (const item of value) harvestWrite(item, ids, names, userIds);
    return;
  }

  if (!isRecord(value)) return;

  if (typeof value.entityId === "string") addEntity(ids, names, value.entityId);
  if (typeof value.userId === "string" && !userIds.includes(value.userId)) {
    userIds.push(value.userId);
  }
  if ("entities" in value) harvestEntityList(value.entities, ids, names);

  for (const key of ["create", "connect", "set", "update"] as const) {
    if (key in value) harvestWrite(value[key], ids, names, userIds);
  }
}

function harvestWhere(
  where: unknown,
  ids: string[],
  names: Map<string, string>,
  userIds: string[],
) {
  if (!isRecord(where)) return;

  if (typeof where.entityId === "string") addEntity(ids, names, where.entityId);
  if (isRecord(where.entityId) && Array.isArray(where.entityId.in)) {
    for (const id of where.entityId.in) {
      if (typeof id === "string") addEntity(ids, names, id);
    }
  }

  if (typeof where.userId === "string" && !userIds.includes(where.userId)) {
    userIds.push(where.userId);
  }
}

function harvestResult(
  result: unknown,
  ids: string[],
  names: Map<string, string>,
  userIds: string[],
) {
  if (!isRecord(result)) return;

  if (typeof result.entityId === "string") addEntity(ids, names, result.entityId);
  if (typeof result.userId === "string" && !userIds.includes(result.userId)) {
    userIds.push(result.userId);
  }

  if (isRecord(result.entity) && typeof result.entity.id === "string") {
    addEntity(
      ids,
      names,
      result.entity.id,
      typeof result.entity.name === "string" ? result.entity.name : null,
    );
  }

  if ("entities" in result) harvestEntityList(result.entities, ids, names);
}

/**
 * Records a successful Prisma write on the current request.
 * Values of secrets are never stored — only field names, labels and ids.
 */
export function noteActivityFromQuery(
  model: string,
  operation: string,
  args: unknown,
  result: unknown,
) {
  try {
    if (!activityStorage.getStore()) return;
    if (SKIP_MODELS.has(model) || !WRITE_OPS.has(operation)) return;

    const data = isRecord(args) ? args.data : undefined;
    const where = isRecord(args) ? args.where : undefined;
    const rawFields = collectFields(data);
    const fields = rawFields.filter((field) => field !== "lastLoggedInAt");

    if (
      model === "User" &&
      (operation === "update" || operation === "updateMany" || operation === "upsert") &&
      rawFields.length > 0 &&
      fields.length === 0
    ) {
      return;
    }

    if (
      (operation === "deleteMany" ||
        operation === "updateMany" ||
        operation === "createMany") &&
      isRecord(result) &&
      result.count === 0
    ) {
      return;
    }

    const record = isRecord(result) ? result : null;
    const label = readLabel(record) ?? readLabel(isRecord(data) ? data : null);
    const recordId = readId(record) ?? readId(where);

    const entityIds: string[] = [];
    const entityNames = new Map<string, string>();
    const userIds: string[] = [];

    harvestResult(result, entityIds, entityNames, userIds);
    harvestWrite(data, entityIds, entityNames, userIds);
    harvestWhere(where, entityIds, entityNames, userIds);

    if (model === "Entity" && recordId) {
      addEntity(entityIds, entityNames, recordId, label);
    }
    if (model === "User" && recordId && !userIds.includes(recordId)) {
      userIds.push(recordId);
    }

    noteActivity({
      model,
      operation: normalizeOperation(operation),
      recordId,
      label,
      entityName:
        model === "Entity"
          ? label
          : entityIds.length === 1
            ? (entityNames.get(entityIds[0]!) ?? null)
            : null,
      entityIds,
      entityNames: entityIds.map((id) => entityNames.get(id) ?? ""),
      userIds,
      fields,
    });
  } catch (error) {
    console.error("[activity] capture failed", error);
  }
}
