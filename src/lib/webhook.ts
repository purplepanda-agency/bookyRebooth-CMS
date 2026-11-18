export type WebhookPayloadValue =
  | string
  | number
  | boolean
  | null
  | WebhookPayloadValue[]
  | { [key: string]: WebhookPayloadValue };

export type WebhookPayload = { [key: string]: WebhookPayloadValue };

/** Standaard webhook-payload met alle bookingvelden als placeholders. */
export const DEFAULT_FLOW_PAYLOAD: WebhookPayload = {
  name: "{{flow.name}}",
  slug: "{{flow.slug}}",
};

export const DEFAULT_WEBHOOK_PAYLOAD: WebhookPayload = {
  webhookName: "{{webhookName}}",
  entityName: "{{entityName}}",
  flow: { ...DEFAULT_FLOW_PAYLOAD },
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

/** HTML-opmerkingenblok voor o.a. Salesforce-payload. */
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

/** Salesforce / Websolve lead-payload. */
export const SALESFORCE_WEBHOOK_PAYLOAD: WebhookPayload = {
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

export type WebhookStepResult = {
  name: string;
  slug: string;
  type: string;
};

export type WebhookContext = {
  webhookName: string;
  entityName: string;
  currentUrl: string;
  flow: { name: string; slug: string };
  /** Vertaling van categorieslug: "new" | "used" | "". */
  interestvehiclenewused: string;
  date: string;
  start: string;
  end: string;
  productName: string | null;
  seller: { id: string; name: string };
  location: {
    id: string;
    name: string;
    permalink: string;
    address: string;
  };
  category: { id: string; name: string; slug: string };
  customer: {
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    email: string;
    address: string;
    currentVehicle: string;
    extraInfo: string;
  };
  /**
   * Dynamische stapresultaten: resultstep1, resultstep2, …
   * `{{resultstep1}}` → name; `{{resultstep1.slug}}` / `.type` ook beschikbaar.
   */
  [resultStepKey: `resultstep${number}`]: WebhookStepResult | undefined;
};

export function buildResultStepContext(
  stepResults:
    | Array<{ index: number; type: string; name: string; slug: string }>
    | null
    | undefined,
): Record<`resultstep${number}`, WebhookStepResult> {
  const out: Record<string, WebhookStepResult> = {};
  for (const result of stepResults ?? []) {
    const index = Number(result.index);
    if (!Number.isInteger(index) || index < 1) continue;
    out[`resultstep${index}`] = {
      name: result.name,
      slug: result.slug,
      type: result.type,
    };
  }
  return out as Record<`resultstep${number}`, WebhookStepResult>;
}

export function buildBookingCurrentUrl(
  publicBaseUrl: string,
  flowSlug?: string | null,
): string {
  const base = publicBaseUrl.trim().replace(/\/$/, "");
  const slug = (flowSlug ?? "").trim().toLowerCase();
  if (!base) return slug ? `/flow/${slug}` : "";
  return slug ? `${base}/flow/${slug}` : base;
}

/** categorieslug → new/used voor Make-veld interestvehiclenewused. */
export function interestVehicleNewUsedFromCategorySlug(slug: string): string {
  const value = slug.trim().toLowerCase();
  if (
    value === "nieuw" ||
    value === "new" ||
    value.startsWith("nieuw")
  ) {
    return "new";
  }
  if (
    value === "tweedehands" ||
    value === "used" ||
    value === "occasion" ||
    value === "occasions" ||
    value.includes("tweedehands") ||
    value.includes("occasion")
  ) {
    return "used";
  }
  return "";
}

function stringifyContextLeaf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") return record.name;
  }
  return String(value);
}

function getContextValue(context: WebhookContext, path: string): string {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  return stringifyContextLeaf(current);
}

function interpolateString(value: string, context: WebhookContext): string {
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) =>
    getContextValue(context, rawPath.trim()),
  );
}

function renderValue(
  value: WebhookPayloadValue,
  context: WebhookContext,
): WebhookPayloadValue {
  if (typeof value === "string") {
    return interpolateString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderValue(item, context));
  }
  if (value && typeof value === "object") {
    const out: WebhookPayload = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = renderValue(child, context);
    }
    return out;
  }
  return value;
}

/** Zorg dat bestaande templates ook flow + interestvehiclenewused meekrijgen. */
export function withFlowPlaceholders(
  template: WebhookPayload | null | undefined,
): WebhookPayload {
  const source =
    template && typeof template === "object" && !Array.isArray(template)
      ? { ...template }
      : { ...DEFAULT_WEBHOOK_PAYLOAD };
  if (!("flow" in source)) {
    source.flow = { ...DEFAULT_FLOW_PAYLOAD };
  }
  if (!("interestvehiclenewused" in source)) {
    source.interestvehiclenewused = "{{interestvehiclenewused}}";
  }
  return source;
}

export function renderWebhookPayload(
  template: WebhookPayload | null | undefined,
  context: WebhookContext,
): WebhookPayload {
  return renderValue(withFlowPlaceholders(template), context) as WebhookPayload;
}

export function isWebhookPayload(
  value: unknown,
): value is WebhookPayload {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type SendWebhookResult =
  | { ok: true; status: number }
  | { ok: false; error: string; status?: number };

/**
 * POST JSON naar een externe webhook-URL.
 * Timeouts na 10s; faalt nooit stil — caller logt analytics MAKE_ERROR
 * (getoond als webhook-fouten in het dashboard).
 */
export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<SendWebhookResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: "Webhook-URL ontbreekt" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(trimmed, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "follow",
    });

    // Externe webhooks (o.a. Make) antwoorden vaak 200; non-2xx = fout + body loggen.
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const detail = body.trim().replace(/\s+/g, " ").slice(0, 400);
      return {
        ok: false,
        status: response.status,
        error: detail
          ? `Webhook HTTP ${response.status}: ${detail}`
          : `Webhook HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Webhook timeout (10s)" };
    }
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Webhook-aanroep mislukt",
    };
  } finally {
    clearTimeout(timeout);
  }
}
