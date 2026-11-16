import { AsyncLocalStorage } from "node:async_hooks";

export type ActivityOperation = "create" | "update" | "delete";

export type ActivityChange = {
  model: string;
  operation: ActivityOperation;
  recordId: string | null;
  label: string | null;
  entityName: string | null;
  entityIds: string[];
  entityNames: string[];
  userIds: string[];
  fields: string[];
};

type ActivityStore = {
  changes: ActivityChange[];
};

export const activityStorage = new AsyncLocalStorage<ActivityStore>();

const MAX_CHANGES = 200;

export function noteActivity(change: ActivityChange) {
  const store = activityStorage.getStore();
  if (!store || store.changes.length >= MAX_CHANGES) return;
  store.changes.push(change);
}
