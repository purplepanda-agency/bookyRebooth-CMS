/** Standaard Make-/webhook-payload — houdt sync met CMS `src/lib/webhook.ts`. */
export const DEFAULT_WEBHOOK_PAYLOAD: Record<string, unknown> = {
  webhookName: "{{webhookName}}",
  entityName: "{{entityName}}",
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

export function cloneDefaultWebhookPayload(): Record<string, unknown> {
  return structuredClone(DEFAULT_WEBHOOK_PAYLOAD);
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
