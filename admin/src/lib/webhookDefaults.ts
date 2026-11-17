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
