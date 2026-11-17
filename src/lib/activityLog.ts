import type { AuthUser } from "../types/express.js";
import {
  type ActivityChange,
  type ActivityOperation,
} from "./activityContext.js";
import { prisma } from "./prisma.js";

const PARENT_MODEL: Record<string, string> = {
  FlowStep: "Flow",
  ProductSetItem: "ProductSet",
  SellerSchedule: "Seller",
  UserEntity: "User",
  ContentBlockStep: "ContentBlock",
};

const CHILD_FIELD: Record<string, string> = {
  FlowStep: "stappen",
  ProductSetItem: "producten",
  SellerSchedule: "agenda",
  UserEntity: "entiteiten",
  ContentBlockStep: "stappen",
};

const NOUN: Record<string, [string, string]> = {
  Entity: ["Entiteit", "Entiteiten"],
  User: ["Gebruiker", "Gebruikers"],
  Location: ["Locatie", "Locaties"],
  Seller: ["Verkoper", "Verkopers"],
  Category: ["Categorie", "Categorieën"],
  Flow: ["Flow", "Flows"],
  ContentBlock: ["Contentblok", "Contentblokken"],
  ProductSet: ["Product set", "Product sets"],
  ProductSetItem: ["Product", "Producten"],
  FlowStep: ["Flowstap", "Flowstappen"],
  SellerSchedule: ["Agenda", "Agenda's"],
  UserEntity: ["Gebruiker", "Gebruikers"],
};

const FIELD_LABEL: Record<string, string> = {
  name: "naam",
  title: "titel",
  text: "tekst",
  buttons: "knoppen",
  slug: "slug",
  email: "e-mail",
  role: "rol",
  passwordHash: "wachtwoord",
  active: "status",
  maintenanceMode: "onderhoudsmodus",
  entities: "entiteiten",
  entiteiten: "entiteiten",
  domain: "domein",
  logoUrl: "logo",
  introText: "introtekst",
  emailExtraTxt: "extra e-mailtekst",
  primaryColor: "primaire kleur",
  secondaryColor: "secundaire kleur",
  accentColor: "accentkleur",
  gtmId: "GTM-id",
  headerScripts: "header scripts",
  footerScripts: "footer scripts",
  calendarProvider: "agenda-koppeling",
  calendarTimezone: "tijdzone",
  outlookTenantId: "Outlook-tenant",
  outlookClientId: "Outlook-client-id",
  outlookClientSecretEnc: "Outlook-clientgeheim",
  googleClientEmail: "Google-client e-mail",
  googlePrivateKeyEnc: "Google-private key",
  googleSubject: "Google-subject",
  googleOAuthClientId: "Google OAuth Client ID",
  googleOAuthClientSecretEnc: "Google OAuth Client secret",
  imageUrl: "afbeelding",
  photoUrl: "foto",
  featuredImage: "uitgelichte afbeelding",
  address: "adres",
  googleMapsUrl: "Google Maps-link",
  phone: "telefoon",
  permalink: "permalink",
  entityId: "entiteit",
  primaryLocationId: "hoofdlocatie",
  categories: "categorieën",
  schedules: "agenda",
  agenda: "agenda",
  products: "producten",
  producten: "producten",
  steps: "stappen",
  stappen: "stappen",
  sortOrder: "volgorde",
  config: "instellingen",
  type: "type",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "userId",
  "flowId",
  "sellerId",
  "productSetId",
  "locationId",
]);

type NameMaps = {
  entities: Map<string, string>;
  users: Map<string, string>;
};

export type ActivityEntryDraft = {
  action: ActivityOperation;
  entryType: string | null;
  summary: string;
  detail: string | null;
  entityId: string | null;
  entityName: string | null;
  entityIdsPacked: string | null;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sameAction(items: ActivityChange[]): ActivityOperation {
  const action = items[0]?.operation ?? "update";
  return items.every((item) => item.operation === action) ? action : "update";
}

function fieldLabel(field: string) {
  return FIELD_LABEL[field] ?? field;
}

function detailText(fields: string[]) {
  const labels = unique(
    fields.filter((field) => !HIDDEN_FIELDS.has(field)).map(fieldLabel),
  );
  if (labels.length === 0) return null;
  const shown = labels.slice(0, 8);
  const more = labels.length > 8 ? ` en ${labels.length - 8} meer` : "";
  const text = `${shown.join(", ")}${more}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function entryTypeLabel(model: string) {
  return NOUN[model]?.[1] ?? model;
}

function formatLabels(labels: string[]) {
  const shown = labels.slice(0, 4);
  const extra = labels.length > 4 ? ` en ${labels.length - 4} meer` : "";
  return shown.length ? `${shown.join(", ")}${extra}` : null;
}

function describeOne(change: ActivityChange): {
  action: ActivityOperation;
  entryType: string;
  summary: string;
  detail: string | null;
} {
  const entryType = entryTypeLabel(change.model);

  if (
    change.model === "User" &&
    change.operation === "update" &&
    change.fields.length === 1 &&
    change.fields[0] === "passwordHash"
  ) {
    return {
      action: "update",
      entryType,
      summary: change.label || "Wachtwoord gewijzigd",
      detail: "Wachtwoord",
    };
  }

  return {
    action: change.operation,
    entryType,
    summary: change.label || "—",
    detail: change.operation === "update" ? detailText(change.fields) : null,
  };
}

function describeGroup(model: string, items: ActivityChange[]) {
  if (items.length === 1) return describeOne(items[0]!);

  const action = sameAction(items);
  const labels = unique(
    items.flatMap((item) => (item.label ? [item.label] : [])),
  );
  const summary =
    formatLabels(labels) ??
    `${items.length} ${entryTypeLabel(model).toLowerCase()}`;

  return {
    action,
    entryType: entryTypeLabel(model),
    summary,
    detail: action === "update" ? detailText(items.flatMap((item) => item.fields)) : null,
  };
}

function withUserLabels(changes: ActivityChange[], users: Map<string, string>) {
  return changes.map((change) => {
    if (change.label) return change;
    if (change.model !== "User" && change.model !== "UserEntity") return change;
    const email = change.userIds.map((id) => users.get(id)).find(Boolean);
    return email ? { ...change, label: email } : change;
  });
}

function collapse(changes: ActivityChange[]) {
  const hints = new Map<string, string[]>();
  for (const change of changes) {
    const parent = PARENT_MODEL[change.model];
    const field = CHILD_FIELD[change.model];
    if (!parent || !field) continue;
    hints.set(parent, unique([...(hints.get(parent) ?? []), field]));
  }

  const primary = changes.filter((change) => !PARENT_MODEL[change.model]);
  if (primary.length > 0) {
    return primary.map((change) => {
      const extra = hints.get(change.model);
      if (!extra) return change;
      return { ...change, fields: unique([...change.fields, ...extra]) };
    });
  }

  const model = PARENT_MODEL[changes[0]?.model ?? ""] ?? changes[0]?.model ?? "Item";
  return [
    {
      model,
      operation: "update" as const,
      recordId: changes[0]?.userIds[0] ?? changes[0]?.recordId ?? null,
      label: changes.find((change) => change.label)?.label ?? null,
      entityName: changes.find((change) => change.entityName)?.entityName ?? null,
      entityIds: unique(changes.flatMap((change) => change.entityIds)),
      entityNames: changes.flatMap((change) => change.entityNames),
      userIds: unique(changes.flatMap((change) => change.userIds)),
      fields: unique(changes.map((change) => CHILD_FIELD[change.model] ?? change.model)),
    },
  ];
}

function isFlowReorder(changes: ActivityChange[]) {
  return (
    changes.length > 1 &&
    changes.every(
      (change) =>
        change.model === "Flow" &&
        change.operation === "update" &&
        change.fields.length > 0 &&
        change.fields.every((field) => field === "sortOrder"),
    )
  );
}

function packEntityIds(ids: string[]) {
  if (ids.length === 0) return null;
  let packed = ",";
  for (const id of ids) {
    const next = `${packed}${id},`;
    if (next.length > 1000) break;
    packed = next;
  }
  return packed === "," ? null : packed;
}

export function summarizeActivity(
  input: ActivityChange[],
  names: NameMaps,
): ActivityEntryDraft | null {
  if (input.length === 0) return null;

  const labeled = withUserLabels(input, names.users);
  const changes = collapse(labeled);

  let action: ActivityOperation = "update";
  let entryType: string | null = null;
  let summary = "Wijziging opgeslagen";
  let detail: string | null = null;

  if (isFlowReorder(changes)) {
    entryType = entryTypeLabel("Flow");
    summary = `Volgorde (${changes.length})`;
    detail = "Volgorde";
  } else {
    const groups = new Map<string, ActivityChange[]>();
    for (const change of changes) {
      groups.set(change.model, [...(groups.get(change.model) ?? []), change]);
    }

    const parts = [...groups.entries()].map(([model, items]) =>
      describeGroup(model, items),
    );
    action = parts.every((part) => part.action === parts[0]?.action)
      ? (parts[0]?.action ?? "update")
      : "update";
    entryType = unique(parts.map((part) => part.entryType)).join(", ") || null;
    summary = parts.map((part) => part.summary).join(" · ") || summary;
    const details = unique(parts.flatMap((part) => (part.detail ? [part.detail] : [])));
    detail = details.length ? details.join(" · ") : null;
  }

  const entityIds = unique(input.flatMap((change) => change.entityIds));
  const entityNames = unique(
    entityIds.flatMap((id) => {
      const fromDb = names.entities.get(id);
      if (fromDb) return [fromDb];
      for (const change of input) {
        const at = change.entityIds.indexOf(id);
        const hinted = at >= 0 ? change.entityNames[at] : "";
        if (hinted) return [hinted];
      }
      if (entityIds.length === 1) {
        const hinted = input.find((change) => change.entityName)?.entityName;
        if (hinted) return [hinted];
      }
      return [];
    }),
  );

  return {
    action,
    entryType: entryType ? entryType.slice(0, 64) : null,
    summary: summary.slice(0, 500),
    detail: detail ? detail.slice(0, 500) : null,
    entityId: entityIds.length === 1 ? entityIds[0]! : null,
    entityName: entityNames.join(", ").slice(0, 255) || null,
    entityIdsPacked: packEntityIds(entityIds),
  };
}

export async function flushActivity(user: AuthUser, changes: ActivityChange[]) {
  if (changes.length === 0) return;

  const entityIds = unique(changes.flatMap((change) => change.entityIds));
  const userIds = unique(
    changes.flatMap((change) =>
      change.model === "User" || change.model === "UserEntity" ? change.userIds : [],
    ),
  );

  const [entities, users] = await Promise.all([
    entityIds.length
      ? prisma.entity.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, name: true },
        })
      : [],
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [],
  ]);

  const entry = summarizeActivity(changes, {
    entities: new Map(entities.map((entity) => [entity.id, entity.name])),
    users: new Map(users.map((account) => [account.id, account.email])),
  });
  if (!entry) return;

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: entry.action,
      entryType: entry.entryType,
      summary: entry.summary,
      detail: entry.detail,
      entityId: entry.entityId,
      entityName: entry.entityName,
      entityIds: entry.entityIdsPacked,
    },
  });
}
