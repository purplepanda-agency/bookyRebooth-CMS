import { env } from "../config/env.js";

function hasSendGridAuth() {
  return Boolean(env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL);
}

export function isSendGridConfigured() {
  return Boolean(hasSendGridAuth() && env.SENDGRID_BOOKING_TEMPLATE_ID);
}

export function isSellerBookingMailConfigured() {
  return Boolean(hasSendGridAuth() && env.SENDGRID_SELLER_BOOKING_TEMPLATE_ID);
}

export function sendGridMissingConfig(): string[] {
  const missing: string[] = [];
  if (!env.SENDGRID_API_KEY) missing.push("SENDGRID_API_KEY");
  if (!env.SENDGRID_FROM_EMAIL) missing.push("SENDGRID_FROM_EMAIL");
  if (!env.SENDGRID_BOOKING_TEMPLATE_ID) {
    missing.push("SENDGRID_BOOKING_TEMPLATE_ID");
  }
  return missing;
}

export function sellerSendGridMissingConfig(): string[] {
  const missing: string[] = [];
  if (!env.SENDGRID_API_KEY) missing.push("SENDGRID_API_KEY");
  if (!env.SENDGRID_FROM_EMAIL) missing.push("SENDGRID_FROM_EMAIL");
  if (!env.SENDGRID_SELLER_BOOKING_TEMPLATE_ID) {
    missing.push("SENDGRID_SELLER_BOOKING_TEMPLATE_ID");
  }
  return missing;
}

/** Exact SendGrid handlebars keys from the customer template. */
export type BookingMailData = {
  locationName: string;
  locationAdress: string;
  time: string;
  employeeName: string;
  emailExtraTxt: string;
  entityLogo: string;
  locationImage: string;
  employeeImage: string;
};

/** Exact SendGrid handlebars keys from the seller template. */
export type SellerBookingMailData = {
  entityLogo: string;
  locationImage: string;
  clientName: string;
  date: string;
  location: string;
  telefoonNummer: string;
  emailAdres: string;
  Adres: string;
  extraInfo: string;
};

export function buildBookingMailData(input: {
  locationName: string;
  locationAddress: string;
  time: string;
  employeeName: string;
  emailExtraTxt: string;
  entityLogo: string;
  locationImage: string;
  employeeImage: string;
}): BookingMailData {
  return {
    locationName: input.locationName,
    locationAdress: input.locationAddress,
    time: input.time,
    employeeName: input.employeeName,
    emailExtraTxt: input.emailExtraTxt,
    entityLogo: input.entityLogo,
    locationImage: input.locationImage,
    employeeImage: input.employeeImage,
  };
}

/**
 * Product/model + current vehicle + remarks, only non-empty parts.
 * Neutral labels so non-automotive dealers stay fine.
 */
export function buildSellerExtraInfo(input: {
  productName?: string | null;
  currentVehicle?: string | null;
  remarks?: string | null;
}) {
  return [input.productName, input.currentVehicle, input.remarks]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

export function buildSellerBookingMailData(input: {
  entityLogo: string;
  locationImage: string;
  clientName: string;
  date: string;
  location: string;
  telefoonNummer: string;
  emailAdres: string;
  address: string;
  productName?: string | null;
  currentVehicle?: string | null;
  remarks?: string | null;
}): SellerBookingMailData {
  return {
    entityLogo: input.entityLogo,
    locationImage: input.locationImage,
    clientName: input.clientName,
    date: input.date,
    location: input.location,
    telefoonNummer: input.telefoonNummer,
    emailAdres: input.emailAdres,
    Adres: input.address,
    extraInfo: buildSellerExtraInfo({
      productName: input.productName,
      currentVehicle: input.currentVehicle,
      remarks: input.remarks,
    }),
  };
}

async function sendSendGridTemplate(input: {
  toEmail: string;
  toName?: string;
  templateId: string;
  data: Record<string, string>;
}) {
  if (!hasSendGridAuth()) {
    throw new Error(
      "SendGrid is niet geconfigureerd (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL)",
    );
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [
            {
              email: input.toEmail,
              ...(input.toName ? { name: input.toName } : {}),
            },
          ],
          dynamic_template_data: input.data,
        },
      ],
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME || env.SENDGRID_FROM_EMAIL,
      },
      template_id: input.templateId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SendGrid mail mislukt (${response.status}): ${text}`);
  }
}

export async function sendBookingConfirmationEmail(input: {
  toEmail: string;
  toName?: string;
  data: BookingMailData;
}) {
  if (!isSendGridConfigured()) {
    throw new Error(
      "SendGrid is niet geconfigureerd (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_BOOKING_TEMPLATE_ID)",
    );
  }

  await sendSendGridTemplate({
    toEmail: input.toEmail,
    toName: input.toName,
    templateId: env.SENDGRID_BOOKING_TEMPLATE_ID!,
    data: input.data,
  });
}

export async function sendSellerBookingEmail(input: {
  toEmail: string;
  toName?: string;
  data: SellerBookingMailData;
}) {
  if (!isSellerBookingMailConfigured()) {
    throw new Error(
      "SendGrid verkoper-mail is niet geconfigureerd (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_SELLER_BOOKING_TEMPLATE_ID)",
    );
  }

  await sendSendGridTemplate({
    toEmail: input.toEmail,
    toName: input.toName,
    templateId: env.SENDGRID_SELLER_BOOKING_TEMPLATE_ID!,
    data: input.data,
  });
}

export function absoluteMediaUrl(
  pathOrUrl: string | null | undefined,
  publicBaseUrl: string,
) {
  if (!pathOrUrl?.trim()) return "";
  const value = pathOrUrl.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const base = publicBaseUrl.replace(/\/$/, "");
  return value.startsWith("/") ? `${base}${value}` : `${base}/${value}`;
}

export function formatAppointmentTime(
  date: string,
  start: string,
  end: string,
) {
  const [year, month, day] = date.split("-").map(Number);
  const dateLabel = new Intl.DateTimeFormat("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year!, (month || 1) - 1, day || 1));
  return `${dateLabel}, ${start} – ${end}`;
}
