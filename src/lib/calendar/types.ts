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
  entityId: string;
  clientId: string;
  clientSecret: string;
};

export type CalendarConfig = OutlookCalendarConfig | GoogleCalendarConfig;

export type CalendarConfigPublic = {
  provider: "NONE" | "OUTLOOK" | "GOOGLE";
  timeZone: string;
  outlookTenantId: string | null;
  outlookClientId: string | null;
  outlookClientSecretSet: boolean;
  googleOAuthClientId: string | null;
  googleOAuthClientSecretSet: boolean;
  googleRedirectUri: string | null;
  configured: boolean;
  message: string | null;
};
