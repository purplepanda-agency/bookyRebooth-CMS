export type WebhookPayloadValue =
  | string
  | number
  | boolean
  | null
  | WebhookPayloadValue[]
  | { [key: string]: WebhookPayloadValue };

export type WebhookPayload = { [key: string]: WebhookPayloadValue };

/** Standaard Make-/webhook-payload met alle bookingvelden als placeholders. */
export const DEFAULT_WEBHOOK_PAYLOAD: WebhookPayload = {
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

export type WebhookContext = {
  webhookName: string;
  entityName: string;
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
};

function getContextValue(context: WebhookContext, path: string): string {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return "";
  return String(current);
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

export function renderWebhookPayload(
  template: WebhookPayload | null | undefined,
  context: WebhookContext,
): WebhookPayload {
  const source =
    template && typeof template === "object" && !Array.isArray(template)
      ? template
      : DEFAULT_WEBHOOK_PAYLOAD;
  return renderValue(source, context) as WebhookPayload;
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
 * POST JSON naar een externe webhook (Make, Zapier, …).
 * Timeouts na 10s; faalt nooit stil — caller logt MAKE_ERROR.
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
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const detail = body.trim().slice(0, 200);
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
