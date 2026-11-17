/** Standaard webhook-payload — houdt sync met CMS `src/lib/webhook.ts`. */
export const DEFAULT_WEBHOOK_PAYLOAD: Record<string, unknown> = {
  webhookName: "{{webhookName}}",
  entityName: "{{entityName}}",
  flow: {
    name: "{{flow.name}}",
    slug: "{{flow.slug}}",
  },
  interestvehiclenewused: "{{interestvehiclenewused}}",
  date: "{{date}}",
  start: "{{start}}",
  end: "{{end}}",
  productName: "{{productName}}",
  seller: {
    id: "{{seller.id}}",
    name: "{{seller.name}}",
  },
  location: {
    id: "{{location.id}}",
    name: "{{location.name}}",
    permalink: "{{location.permalink}}",
    address: "{{location.address}}",
  },
  category: {
    id: "{{category.id}}",
    name: "{{category.name}}",
    slug: "{{category.slug}}",
  },
  customer: {
    firstName: "{{customer.firstName}}",
    lastName: "{{customer.lastName}}",
    fullName: "{{customer.fullName}}",
    phone: "{{customer.phone}}",
    email: "{{customer.email}}",
    address: "{{customer.address}}",
    currentVehicle: "{{customer.currentVehicle}}",
    extraInfo: "{{customer.extraInfo}}",
  },
};

/** HTML-opmerkingenblok — houdt sync met CMS `src/lib/webhook.ts`. */
export const DEFAULT_OPMERKINGEN_TEMPLATE = [
  "<strong>Klant</strong>",
  "Naam: {{customer.fullName}}",
  "Voornaam: {{customer.firstName}}",
  "Achternaam: {{customer.lastName}}",
  "Telefoon: {{customer.phone}}",
  "E-mail: {{customer.email}}",
  "Adres: {{customer.address}}",
  "Huidig voertuig: {{customer.currentVehicle}}",
  "Extra info: {{customer.extraInfo}}",
  "",
  "<strong>Afspraak</strong>",
  "Datum: {{date}}",
  "Start: {{start}}",
  "Einde: {{end}}",
  "Product: {{productName}}",
  "Verkoper: {{seller.name}}",
  "",
  "<strong>Locatie / categorie</strong>",
  "Locatie: {{location.name}}",
  "Adres locatie: {{location.address}}",
  "Categorie: {{category.name}}",
].join("<br>");

/** Salesforce / Websolve lead-payload — houdt sync met CMS `src/lib/webhook.ts`. */
export const SALESFORCE_WEBHOOK_PAYLOAD: Record<string, unknown> = {
  url: "{{currentUrl}}",
  aanhef: "",
  voornaam: "{{customer.firstName}}",
  achternaam: "{{customer.lastName}}",
  email: "{{customer.email}}",
  telefoonnummer: "{{customer.phone}}",
  opmerkingen: DEFAULT_OPMERKINGEN_TEMPLATE,
  concessie: "{{location.permalink}}",
  brand: "{{flow.name}}",
  interestvehiclebrand: "{{flow.name}}",
  interestvehiclemodel: "{{productName}}",
  interestvehiclenewused: "{{interestvehiclenewused}}",
  interestvehiclestate: "",
  herkomst: "{{currentUrl}}",
  campaign: "Contact - {{currentUrl}} - SQL",
  LeadContextWholesale: "Contact - {{currentUrl}} - SQL",
  websolverequesttype: "contact_request",
  sas: "sales",
  aanvraagtype: "Afspraak boekingstool",
  GDPR: "1",
};

export type FlowWebhookConfig = {
  id: string;
  name: string;
  url: string;
  payload: Record<string, unknown>;
};

export function cloneDefaultWebhookPayload(): Record<string, unknown> {
  return structuredClone(DEFAULT_WEBHOOK_PAYLOAD);
}

export function cloneSalesforceWebhookPayload(): Record<string, unknown> {
  return structuredClone(SALESFORCE_WEBHOOK_PAYLOAD);
}

export function formatWebhookPayloadJson(
  payload: Record<string, unknown> | null | undefined,
) {
  const value =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : DEFAULT_WEBHOOK_PAYLOAD;
  return JSON.stringify(value, null, 2);
}

export function createEmptyWebhook(): FlowWebhookConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    url: "",
    payload: cloneDefaultWebhookPayload(),
  };
}

function asPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return cloneDefaultWebhookPayload();
}

/** Normaliseer opgeslagen config (incl. legacy single-webhook velden). */
export function normalizeWebhooksFromConfig(
  config: Record<string, unknown> | null | undefined,
): FlowWebhookConfig[] {
  if (!config) return [];

  const list = config.webhooks;
  if (Array.isArray(list)) {
    return list
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
      .map((item) => ({
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id.trim()
            : crypto.randomUUID(),
        name: typeof item.name === "string" ? item.name.trim() : "",
        url: typeof item.url === "string" ? item.url.trim() : "",
        payload: asPayload(item.payload),
      }));
  }

  const legacyUrl =
    typeof config.webhookUrl === "string" ? config.webhookUrl.trim() : "";
  if (!legacyUrl) return [];

  return [
    {
      id: crypto.randomUUID(),
      name:
        typeof config.webhookName === "string"
          ? config.webhookName.trim()
          : "",
      url: legacyUrl,
      payload: asPayload(config.webhookPayload),
    },
  ];
}

export type WebhookVariableItem = {
  key: string;
  label: string;
};

export type WebhookVariableGroup = {
  id: string;
  title: string;
  items: WebhookVariableItem[];
};

export function buildWebhookVariableGroups(
  flowSteps: Array<{ type: string; title?: string }>,
): WebhookVariableGroup[] {
  const stepGroups: WebhookVariableGroup[] = flowSteps.map((step, index) => {
    const n = index + 1;
    const title =
      step.title?.trim() ||
      (step.type === "FREE_CHOICE"
        ? `Vrije keuze ${n}`
        : step.type === "SELLERS_AGENDA"
          ? `Agenda ${n}`
          : `Stap ${n}`);
    return {
      id: `resultstep${n}`,
      title: title.toUpperCase(),
      items: [
        {
          key: `resultstep${n}.name`,
          label: `resultstep${n}.name`,
        },
        {
          key: `resultstep${n}.slug`,
          label: `resultstep${n}.slug`,
        },
      ],
    };
  });

  return [
    ...stepGroups,
    {
      id: "booking",
      title: "BOOKING",
      items: [
        { key: "date", label: "date" },
        { key: "start", label: "start" },
        { key: "end", label: "end" },
        { key: "seller.name", label: "seller.name" },
        {
          key: "interestvehiclenewused",
          label: "interestvehiclenewused",
        },
      ],
    },
    {
      id: "customer",
      title: "CUSTOMER",
      items: [
        { key: "customer.firstName", label: "customer.firstName" },
        { key: "customer.lastName", label: "customer.lastName" },
        { key: "customer.fullName", label: "customer.fullName" },
        { key: "customer.phone", label: "customer.phone" },
        { key: "customer.email", label: "customer.email" },
        { key: "customer.address", label: "customer.address" },
        {
          key: "customer.currentVehicle",
          label: "customer.currentVehicle",
        },
        { key: "customer.extraInfo", label: "customer.extraInfo" },
      ],
    },
    {
      id: "meta",
      title: "META",
      items: [
        { key: "webhookName", label: "webhookName" },
        { key: "entityName", label: "entityName" },
        { key: "currentUrl", label: "currentUrl" },
        { key: "flow.name", label: "flow.name" },
        { key: "flow.slug", label: "flow.slug" },
      ],
    },
  ];
}

function sampleLeaf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") return record.name;
  }
  return String(value);
}

function getSampleValue(
  context: Record<string, unknown>,
  path: string,
): string {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  return sampleLeaf(current);
}

function interpolateSample(
  value: string,
  context: Record<string, unknown>,
): string {
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) =>
    getSampleValue(context, rawPath.trim()),
  );
}

function renderSampleValue(
  value: unknown,
  context: Record<string, unknown>,
): unknown {
  if (typeof value === "string") return interpolateSample(value, context);
  if (Array.isArray(value)) {
    return value.map((item) => renderSampleValue(item, context));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = renderSampleValue(child, context);
    }
    return out;
  }
  return value;
}

export type SampleWebhookBookingExtras = {
  webhookName?: string;
  entityName?: string;
  flowName?: string;
  flowSlug?: string;
  /** Echte locatie uit de flow (indien aanwezig). */
  location?: {
    id?: string;
    name: string;
    permalink: string;
    address: string;
  } | null;
  /** Echte categorie uit de flow (indien aanwezig). */
  category?: {
    id?: string;
    name: string;
    slug: string;
  } | null;
  /** Echt product uit de flow (indien aanwezig). */
  productName?: string | null;
  /** new/used op basis van echte categorieslug. */
  interestvehiclenewused?: string;
};

function interestFromCategorySlug(slug: string): string {
  const value = slug.trim().toLowerCase();
  if (value === "nieuw" || value === "new" || value.startsWith("nieuw")) {
    return "new";
  }
  if (
    value === "tweedehands" ||
    value === "used" ||
    value.includes("tweedehands") ||
    value.includes("occasion")
  ) {
    return "used";
  }
  return "";
}

export function buildSampleWebhookContext(
  flowSteps: Array<{
    type: string;
    title?: string;
    sampleName?: string;
    sampleSlug?: string;
  }>,
  options?: SampleWebhookBookingExtras,
): Record<string, unknown> {
  const flowSlug = options?.flowSlug?.trim() || "voorbeeld";
  const flowName = options?.flowName?.trim() || "Voorbeeld flow";
  const entityName = options?.entityName?.trim() || "Voorbeeld Dealer";

  const location = options?.location;
  const category = options?.category;
  const productName = options?.productName?.trim() || null;

  const categorySlug = category?.slug || "";
  const interestvehiclenewused =
    options?.interestvehiclenewused ??
    (categorySlug ? interestFromCategorySlug(categorySlug) : "new");

  const context: Record<string, unknown> = {
    webhookName: options?.webhookName || "Voorbeeld webhook",
    entityName,
    currentUrl: `https://book.example/flow/${flowSlug}`,
    flow: {
      name: flowName,
      slug: flowSlug,
    },
    interestvehiclenewused,
    // Vrije / runtime velden blijven voorbeelddata
    date: "2026-11-20",
    start: "10:00",
    end: "10:30",
    productName: productName || "Model Voorbeeld",
    seller: { id: "seller-1", name: "Jan Jansen" },
    location: {
      id: location?.id || "loc-1",
      name: location?.name || "Brussel",
      permalink: location?.permalink || "brussel",
      address: location?.address || "Voorbeeldstraat 1",
    },
    category: {
      id: category?.id || "cat-1",
      name: category?.name || "Nieuw",
      slug: category?.slug || "nieuw",
    },
    customer: {
      firstName: "Marie",
      lastName: "Peeters",
      fullName: "Marie Peeters",
      phone: "+32 470 00 00 00",
      email: "marie@example.com",
      address: "Klantstraat 12",
      currentVehicle: "Oude wagen",
      extraInfo: "Graag ochtend",
    },
  };

  flowSteps.forEach((step, index) => {
    const n = index + 1;
    context[`resultstep${n}`] = {
      name: step.sampleName || `Keuze stap ${n}`,
      slug: step.sampleSlug || `stap-${n}`,
      type: step.type,
    };
  });

  return context;
}

export function previewWebhookPayloadJson(
  rawJson: string,
  context: Record<string, unknown>,
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "JSON moet een object zijn ({ … })" };
    }
    const rendered = renderSampleValue(parsed, context);
    return { ok: true, text: JSON.stringify(rendered, null, 2) };
  } catch {
    return { ok: false, error: "Ongeldige JSON — resultaat niet beschikbaar" };
  }
}
