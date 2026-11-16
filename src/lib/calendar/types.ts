export type OutlookCalendarConfig = {
  provider: "OUTLOOK";
  timeZone: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export type GoogleCalendarConfig = {
  provider: "GOOGLE";
  timeZone: string;
  clientEmail: string;
  privateKey: string;
  subject: string | null;
};

export type CalendarConfig = OutlookCalendarConfig | GoogleCalendarConfig;

export type CalendarConfigPublic = {
  provider: "NONE" | "OUTLOOK" | "GOOGLE";
  timeZone: string;
  outlookTenantId: string | null;
  outlookClientId: string | null;
  outlookClientSecretSet: boolean;
  googleClientEmail: string | null;
  googlePrivateKeySet: boolean;
  googleSubject: string | null;
  configured: boolean;
  message: string | null;
};
