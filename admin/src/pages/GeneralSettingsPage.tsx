import { type FormEvent, useEffect, useState } from "react";
import { api, uploadMedia } from "../api/client";
import { useAccessibleEntities } from "../auth/entityAccess";
import { BasicWysiwyg } from "../components/BasicWysiwyg";

type SettingsTab =
  | "content"
  | "domain"
  | "tracking"
  | "integrations"
  | "sellers";

type CalendarProvider = "NONE" | "OUTLOOK" | "GOOGLE";

type CalendarSettings = {
  provider: CalendarProvider;
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

type SellerConnection = {
  sellerId: string;
  name: string;
  email: string;
  imageUrl: string;
  visible: boolean;
  status: string;
  detail?: string;
  googleConnected?: boolean;
  googleConnectedEmail?: string | null;
  entity?: { id: string; name: string; slug: string } | null;
};

type AvailabilityRow = {
  sellerId: string;
  name: string;
  email: string;
  imageUrl: string;
  available: boolean;
  status: string;
  detail?: string;
};

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "content", label: "Algemene content" },
  { id: "domain", label: "Domeininstellingen" },
  { id: "tracking", label: "Tracking" },
  { id: "integrations", label: "Integraties" },
  { id: "sellers", label: "Verkopersconnecties" },
];

function todayIsoDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nextHalfHour() {
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function GeneralSettingsPage() {
  const {
    selectedEntityId: entityId,
    selectedEntity,
    settleEntityTransition,
  } = useAccessibleEntities();
  const [activeTab, setActiveTab] = useState<SettingsTab>("content");
  const [connections, setConnections] = useState<SellerConnection[]>([]);
  const [configured, setConfigured] = useState(true);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testDate, setTestDate] = useState(todayIsoDate());
  const [testTime, setTestTime] = useState(nextHalfHour());
  const [testing, setTesting] = useState(false);
  const [availabilityResults, setAvailabilityResults] = useState<
    AvailabilityRow[] | null
  >(null);
  const [availableCount, setAvailableCount] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [domainValue, setDomainValue] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [domainEntityName, setDomainEntityName] = useState("");
  const [loadingDomain, setLoadingDomain] = useState(false);
  const [savingDomain, setSavingDomain] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [introText, setIntroText] = useState("");
  const [emailExtraTxt, setEmailExtraTxt] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#121417");
  const [secondaryColor, setSecondaryColor] = useState("#667085");
  const [accentColor, setAccentColor] = useState("#2766ab");
  const [loadingContent, setLoadingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [gtmId, setGtmId] = useState("");
  const [headerScripts, setHeaderScripts] = useState("");
  const [footerScripts, setFooterScripts] = useState("");
  const [trackingEntityName, setTrackingEntityName] = useState("");
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [savingTracking, setSavingTracking] = useState(false);
  const [calendarProvider, setCalendarProvider] =
    useState<CalendarProvider>("NONE");
  const [calendarTimeZone, setCalendarTimeZone] = useState("Europe/Brussels");
  const [outlookTenantId, setOutlookTenantId] = useState("");
  const [outlookClientId, setOutlookClientId] = useState("");
  const [outlookClientSecret, setOutlookClientSecret] = useState("");
  const [outlookClientSecretSet, setOutlookClientSecretSet] = useState(false);
  const [clearOutlookClientSecret, setClearOutlookClientSecret] =
    useState(false);
  const [googleOAuthClientId, setGoogleOAuthClientId] = useState("");
  const [googleOAuthClientSecret, setGoogleOAuthClientSecret] = useState("");
  const [googleOAuthClientSecretSet, setGoogleOAuthClientSecretSet] =
    useState(false);
  const [clearGoogleOAuthClientSecret, setClearGoogleOAuthClientSecret] =
    useState(false);
  const [googleRedirectUri, setGoogleRedirectUri] = useState<string | null>(
    null,
  );
  const [calendarConfigured, setCalendarConfigured] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [integrationsEntityName, setIntegrationsEntityName] = useState("");
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [connectionsProvider, setConnectionsProvider] =
    useState<CalendarProvider | null>(null);
  const [oauthBusySellerId, setOauthBusySellerId] = useState<string | null>(
    null,
  );
  const [oauthNotice, setOauthNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const mediaEntityKey = selectedEntity?.slug || "global";

  function applyCalendarSettings(calendar: CalendarSettings) {
    setCalendarProvider(calendar.provider);
    setCalendarTimeZone(calendar.timeZone || "Europe/Brussels");
    setOutlookTenantId(calendar.outlookTenantId || "");
    setOutlookClientId(calendar.outlookClientId || "");
    setOutlookClientSecret("");
    setOutlookClientSecretSet(calendar.outlookClientSecretSet);
    setClearOutlookClientSecret(false);
    setGoogleOAuthClientId(calendar.googleOAuthClientId || "");
    setGoogleOAuthClientSecret("");
    setGoogleOAuthClientSecretSet(calendar.googleOAuthClientSecretSet);
    setClearGoogleOAuthClientSecret(false);
    setGoogleRedirectUri(calendar.googleRedirectUri);
    setCalendarConfigured(calendar.configured);
    setCalendarMessage(calendar.message);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "sellers" || tab === "integrations" || tab === "content" || tab === "domain" || tab === "tracking") {
      setActiveTab(tab);
    }
    const oauth = params.get("googleOauth");
    const message = params.get("message");
    if (oauth === "success" || oauth === "error") {
      setOauthNotice({
        type: oauth,
        message: message || (oauth === "success" ? "Google gekoppeld" : "Koppelen mislukt"),
      });
      setActiveTab("sellers");
      params.delete("googleOauth");
      params.delete("message");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${next ? `?${next}` : ""}`,
      );
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "sellers") return;
    if (!entityId) return;

    let cancelled = false;

    async function loadConnections() {
      setLoadingConnections(true);
      setError(null);
      setAvailabilityResults(null);
      try {
        const query =
          entityId
            ? `?entityId=${encodeURIComponent(entityId)}`
            : "";
        const data = await api<{
          configured: boolean;
          provider?: CalendarProvider | null;
          message?: string;
          connections: SellerConnection[];
        }>(`/seller-connections${query}`);
        if (cancelled) return;
        setConfigured(data.configured);
        setConnectionsProvider(data.provider ?? null);
        setConfigMessage(data.message ?? null);
        setConnections(data.connections);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Connecties laden mislukt",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingConnections(false);
          settleEntityTransition();
        }
      }
    }

    void loadConnections();
    return () => {
      cancelled = true;
    };
  }, [activeTab, entityId]);

  useEffect(() => {
    if (activeTab !== "content") return;
    if (!entityId) return;

    let cancelled = false;

    async function loadContent() {
      setLoadingContent(true);
      setError(null);
      try {
        const query =
          entityId
            ? `?entityId=${encodeURIComponent(entityId)}`
            : "";
        const data = await api<{
          entity: {
            name: string;
            logoUrl: string | null;
            introText: string | null;
            emailExtraTxt: string | null;
            primaryColor: string | null;
            secondaryColor: string | null;
            accentColor: string | null;
          };
        }>(`/settings/content${query}`);
        if (cancelled) return;
        setLogoUrl(data.entity.logoUrl || "");
        setIntroText(data.entity.introText || "");
        setEmailExtraTxt(data.entity.emailExtraTxt || "");
        setPrimaryColor(data.entity.primaryColor || "#121417");
        setSecondaryColor(data.entity.secondaryColor || "#667085");
        setAccentColor(data.entity.accentColor || "#2766ab");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Content laden mislukt",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingContent(false);
          settleEntityTransition();
        }
      }
    }

    void loadContent();
    return () => {
      cancelled = true;
    };
  }, [activeTab, entityId]);

  useEffect(() => {
    if (activeTab !== "tracking") return;
    if (!entityId) return;

    let cancelled = false;

    async function loadTracking() {
      setLoadingTracking(true);
      setError(null);
      try {
        const query =
          entityId
            ? `?entityId=${encodeURIComponent(entityId)}`
            : "";
        const data = await api<{
          entity: {
            name: string;
            gtmId: string | null;
            headerScripts: string | null;
            footerScripts: string | null;
          };
        }>(`/settings/tracking${query}`);
        if (cancelled) return;
        setGtmId(data.entity.gtmId || "");
        setHeaderScripts(data.entity.headerScripts || "");
        setFooterScripts(data.entity.footerScripts || "");
        setTrackingEntityName(data.entity.name);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Tracking laden mislukt",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTracking(false);
          settleEntityTransition();
        }
      }
    }

    void loadTracking();
    return () => {
      cancelled = true;
    };
  }, [activeTab, entityId]);

  useEffect(() => {
    if (activeTab !== "domain") return;
    if (!entityId) return;

    let cancelled = false;

    async function loadDomain() {
      setLoadingDomain(true);
      setError(null);
      try {
        const query =
          entityId
            ? `?entityId=${encodeURIComponent(entityId)}`
            : "";
        const data = await api<{
          entity: {
            name: string;
            slug: string;
            domain: string | null;
            maintenanceMode: boolean;
          };
        }>(`/settings/domain${query}`);
        if (cancelled) return;
        setDomainValue(data.entity.domain || "");
        setMaintenanceMode(Boolean(data.entity.maintenanceMode));
        setDomainEntityName(data.entity.name);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Domein laden mislukt",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingDomain(false);
          settleEntityTransition();
        }
      }
    }

    void loadDomain();
    return () => {
      cancelled = true;
    };
  }, [activeTab, entityId]);

  useEffect(() => {
    if (activeTab !== "integrations") return;
    if (!entityId) return;

    let cancelled = false;

    async function loadIntegrations() {
      setLoadingIntegrations(true);
      setError(null);
      try {
        const query = `?entityId=${encodeURIComponent(entityId)}`;
        const data = await api<{
          entity: {
            name: string;
            calendar: CalendarSettings;
          };
        }>(`/settings/calendar${query}`);
        if (cancelled) return;
        setIntegrationsEntityName(data.entity.name);
        applyCalendarSettings(data.entity.calendar);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Integraties laden mislukt",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingIntegrations(false);
          settleEntityTransition();
        }
      }
    }

    void loadIntegrations();
    return () => {
      cancelled = true;
    };
  }, [activeTab, entityId, settleEntityTransition]);

  async function onLogoChange(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const url = await uploadMedia(file, mediaEntityKey);
      setLogoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload mislukt");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveContent(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }

    setSavingContent(true);
    setError(null);
    try {
      const data = await api<{
        entity: {
          name: string;
          logoUrl: string | null;
          introText: string | null;
          emailExtraTxt: string | null;
          primaryColor: string | null;
          secondaryColor: string | null;
          accentColor: string | null;
        };
      }>("/settings/content", {
        method: "PATCH",
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          introText: introText.trim() || null,
          emailExtraTxt: emailExtraTxt.trim() || null,
          primaryColor: primaryColor || null,
          secondaryColor: secondaryColor || null,
          accentColor: accentColor || null,
          ...(entityId ? { entityId } : {}),
        }),
      });
      setLogoUrl(data.entity.logoUrl || "");
      setIntroText(data.entity.introText || "");
      setEmailExtraTxt(data.entity.emailExtraTxt || "");
      setPrimaryColor(data.entity.primaryColor || "#121417");
      setSecondaryColor(data.entity.secondaryColor || "#667085");
      setAccentColor(data.entity.accentColor || "#2766ab");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Content opslaan mislukt");
    } finally {
      setSavingContent(false);
    }
  }

  async function saveDomain(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }

    setSavingDomain(true);
    setError(null);
    try {
      const data = await api<{
        entity: {
          name: string;
          domain: string | null;
          maintenanceMode: boolean;
        };
      }>("/settings/domain", {
        method: "PATCH",
        body: JSON.stringify({
          domain: domainValue,
          maintenanceMode,
          ...(entityId ? { entityId } : {}),
        }),
      });
      setDomainValue(data.entity.domain || "");
      setMaintenanceMode(Boolean(data.entity.maintenanceMode));
      setDomainEntityName(data.entity.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Domein opslaan mislukt");
    } finally {
      setSavingDomain(false);
    }
  }

  async function saveTracking(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }

    setSavingTracking(true);
    setError(null);
    try {
      const data = await api<{
        entity: {
          name: string;
          gtmId: string | null;
          headerScripts: string | null;
          footerScripts: string | null;
        };
      }>("/settings/tracking", {
        method: "PATCH",
        body: JSON.stringify({
          gtmId: gtmId.trim() || null,
          headerScripts: headerScripts.trim() || null,
          footerScripts: footerScripts.trim() || null,
          ...(entityId ? { entityId } : {}),
        }),
      });
      setGtmId(data.entity.gtmId || "");
      setHeaderScripts(data.entity.headerScripts || "");
      setFooterScripts(data.entity.footerScripts || "");
      setTrackingEntityName(data.entity.name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Tracking opslaan mislukt",
      );
    } finally {
      setSavingTracking(false);
    }
  }

  async function saveIntegrations(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }

    setSavingIntegrations(true);
    setError(null);
    try {
      const data = await api<{
        entity: {
          name: string;
          calendar: CalendarSettings;
        };
      }>("/settings/calendar", {
        method: "PATCH",
        body: JSON.stringify({
          provider: calendarProvider,
          timeZone: calendarTimeZone.trim() || "Europe/Brussels",
          outlookTenantId: outlookTenantId.trim() || null,
          outlookClientId: outlookClientId.trim() || null,
          outlookClientSecret: outlookClientSecret.trim() || null,
          clearOutlookClientSecret,
          googleOAuthClientId: googleOAuthClientId.trim() || null,
          googleOAuthClientSecret: googleOAuthClientSecret.trim() || null,
          clearGoogleOAuthClientSecret,
          entityId,
        }),
      });
      setIntegrationsEntityName(data.entity.name);
      applyCalendarSettings(data.entity.calendar);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Integraties opslaan mislukt",
      );
    } finally {
      setSavingIntegrations(false);
    }
  }

  async function connectGoogle(sellerId: string) {
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }
    setOauthBusySellerId(sellerId);
    setError(null);
    try {
      const data = await api<{ url: string }>("/google-oauth/start", {
        method: "POST",
        body: JSON.stringify({
          sellerId,
          entityId,
          returnOrigin: window.location.origin,
        }),
      });
      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google-koppeling starten mislukt",
      );
      setOauthBusySellerId(null);
    }
  }

  async function disconnectGoogle(sellerId: string) {
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }
    setOauthBusySellerId(sellerId);
    setError(null);
    try {
      await api("/google-oauth/disconnect", {
        method: "POST",
        body: JSON.stringify({ sellerId, entityId }),
      });
      setConnections((prev) =>
        prev.map((row) =>
          row.sellerId === sellerId
            ? {
                ...row,
                googleConnected: false,
                googleConnectedEmail: null,
                visible: false,
                status: "Agenda niet bereikbaar",
                detail: "Google-agenda niet gekoppeld",
              }
            : row,
        ),
      );
      setOauthNotice({
        type: "success",
        message: "Google-koppeling verwijderd",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ontkoppelen mislukt",
      );
    } finally {
      setOauthBusySellerId(null);
    }
  }

  async function runAvailabilityTest() {
    if (!entityId) {
      setError("Kies een entiteit");
      return;
    }

    setTesting(true);
    setError(null);
    setAvailabilityResults(null);
    try {
      const data = await api<{
        results: AvailabilityRow[];
        availableCount: number;
        checked: number;
      }>("/seller-connections/availability-test", {
        method: "POST",
        body: JSON.stringify({
          date: testDate,
          time: testTime,
          durationMinutes: 30,
          ...(entityId ? { entityId } : {}),
        }),
      });
      setAvailabilityResults(data.results);
      setAvailableCount(data.availableCount);
      setCheckedCount(data.checked);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Beschikbaarheidstest mislukt",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Algemene instellingen</h1>
          <p>Instellingen voor jouw entiteit.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Instellingen secties">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={activeTab === tab.id ? "tab active" : "tab"}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "integrations" ? (
        <div className="stack">
          {error ? <p className="error">{error}</p> : null}
          {loadingIntegrations ? (
            <div className="empty">Integraties laden…</div>
          ) : (
            <form className="panel" onSubmit={saveIntegrations}>
              <div className="panel-body stack">
                <div>
                  <h2 style={{ marginBottom: "0.35rem" }}>Agenda-integratie</h2>
                  <p className="muted">
                    Credentials voor{" "}
                    {integrationsEntityName || selectedEntity?.name || "deze entiteit"}.
                    Secrets worden versleuteld opgeslagen en nooit teruggetoond.
                  </p>
                </div>

                {calendarMessage ? (
                  <p className={calendarConfigured ? "muted" : "error"}>
                    {calendarMessage}
                  </p>
                ) : calendarConfigured ? (
                  <p className="muted">Agenda-provider is volledig geconfigureerd.</p>
                ) : null}

                <label>
                  Provider
                  <select
                    value={calendarProvider}
                    onChange={(event) =>
                      setCalendarProvider(event.target.value as CalendarProvider)
                    }
                  >
                    <option value="NONE">Geen</option>
                    <option value="OUTLOOK">Outlook (Microsoft 365)</option>
                    <option value="GOOGLE">Google Calendar</option>
                  </select>
                </label>

                <label>
                  Tijdzone
                  <input
                    value={calendarTimeZone}
                    onChange={(event) => setCalendarTimeZone(event.target.value)}
                    placeholder="Europe/Brussels"
                  />
                </label>

                {calendarProvider === "OUTLOOK" ? (
                  <>
                    <label>
                      Tenant ID
                      <input
                        value={outlookTenantId}
                        onChange={(event) =>
                          setOutlookTenantId(event.target.value)
                        }
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Client ID
                      <input
                        value={outlookClientId}
                        onChange={(event) =>
                          setOutlookClientId(event.target.value)
                        }
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Client secret
                      <input
                        type="password"
                        value={outlookClientSecret}
                        onChange={(event) => {
                          setOutlookClientSecret(event.target.value);
                          if (event.target.value) {
                            setClearOutlookClientSecret(false);
                          }
                        }}
                        placeholder={
                          outlookClientSecretSet
                            ? "•••••••• (laat leeg om te behouden)"
                            : "Plak client secret"
                        }
                        autoComplete="new-password"
                      />
                    </label>
                    {outlookClientSecretSet ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={clearOutlookClientSecret}
                          onChange={(event) => {
                            setClearOutlookClientSecret(event.target.checked);
                            if (event.target.checked) {
                              setOutlookClientSecret("");
                            }
                          }}
                        />
                        Bestaande client secret wissen
                      </label>
                    ) : null}
                  </>
                ) : null}

                {calendarProvider === "GOOGLE" ? (
                  <>
                    <p className="muted">
                      Authenticatie gebeurt per verkoper. Voeg de verkopers toe
                      bij &apos;Verkopers&apos; en onder het tabblad
                      &apos;Verkopersconnecties&apos; bij de algemene
                      instellingen kan je de connectie per verkoper maken.
                    </p>
                    <label>
                      OAuth Client ID
                      <input
                        value={googleOAuthClientId}
                        onChange={(event) =>
                          setGoogleOAuthClientId(event.target.value)
                        }
                        autoComplete="off"
                        placeholder="….apps.googleusercontent.com"
                      />
                    </label>
                    <label>
                      OAuth Client secret
                      <input
                        type="password"
                        value={googleOAuthClientSecret}
                        onChange={(event) => {
                          setGoogleOAuthClientSecret(event.target.value);
                          if (event.target.value) {
                            setClearGoogleOAuthClientSecret(false);
                          }
                        }}
                        placeholder={
                          googleOAuthClientSecretSet
                            ? "Laat leeg om het bestaande secret te behouden"
                            : ""
                        }
                        autoComplete="new-password"
                      />
                    </label>
                    {googleOAuthClientSecretSet ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={clearGoogleOAuthClientSecret}
                          onChange={(event) => {
                            setClearGoogleOAuthClientSecret(
                              event.target.checked,
                            );
                            if (event.target.checked) {
                              setGoogleOAuthClientSecret("");
                            }
                          }}
                        />
                        Bestaand client secret wissen
                      </label>
                    ) : null}
                    {googleRedirectUri ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Zet in Google Cloud bij Authorized redirect URIs exact:{" "}
                        <code>{googleRedirectUri}</code>
                      </p>
                    ) : (
                      <p className="error" style={{ margin: 0 }}>
                        Server mist GOOGLE_OAUTH_REDIRECT_URI of PUBLIC_BASE_URL.
                      </p>
                    )}
                  </>
                ) : null}

                <div className="actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingIntegrations || !entityId}
                  >
                    {savingIntegrations ? "Opslaan…" : "Opslaan"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {activeTab === "sellers" ? (
        <div className="stack">
          {error ? <p className="error">{error}</p> : null}
          {oauthNotice ? (
            <p className={oauthNotice.type === "success" ? "muted" : "error"}>
              {oauthNotice.message}
            </p>
          ) : null}

          {!configured && configMessage ? (
            <div className="panel">
              <div className="panel-body">
                <p className="muted">{configMessage}</p>
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-body">
              <h2 style={{ marginBottom: "0.75rem" }}>Verkopersagenda’s</h2>
              <p className="muted" style={{ marginBottom: "1rem" }}>
                {connectionsProvider === "GOOGLE"
                  ? "Koppel per verkoper een Google-account. De primary agenda van dat account wordt gebruikt voor beschikbaarheid en boekingen."
                  : "Status op basis van het e-mailadres van de verkoper en de agenda-integratie van deze entiteit."}
              </p>

              {loadingConnections ? (
                <div className="empty">Connecties controleren…</div>
              ) : connections.length === 0 ? (
                <div className="empty">Nog geen actieve verkopers.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Verkoper</th>
                      <th>E-mail</th>
                      <th>Status</th>
                      {connectionsProvider === "GOOGLE" ? (
                        <th style={{ width: 180 }}>Actie</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((connection) => (
                      <tr key={connection.sellerId}>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                            }}
                          >
                            <img
                              src={connection.imageUrl}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: "cover",
                                borderRadius: 6,
                                border: "1px solid var(--line)",
                              }}
                            />
                            <span>{connection.name}</span>
                          </div>
                        </td>
                        <td>
                          {connection.email}
                          {connection.googleConnectedEmail ? (
                            <div className="muted" style={{ fontSize: "0.82rem" }}>
                              Google: {connection.googleConnectedEmail}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={
                              connection.visible
                                ? "badge badge-success"
                                : "badge badge-danger"
                            }
                            title={connection.detail || undefined}
                          >
                            {connection.status}
                          </span>
                          {connection.detail && !connection.visible ? (
                            <div
                              className="muted"
                              style={{
                                fontSize: "0.78rem",
                                marginTop: "0.35rem",
                                maxWidth: 320,
                                wordBreak: "break-word",
                              }}
                            >
                              {connection.detail}
                            </div>
                          ) : null}
                        </td>
                        {connectionsProvider === "GOOGLE" ? (
                          <td>
                            {connection.googleConnected ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                disabled={
                                  oauthBusySellerId === connection.sellerId
                                }
                                onClick={() =>
                                  void disconnectGoogle(connection.sellerId)
                                }
                              >
                                {oauthBusySellerId === connection.sellerId
                                  ? "Bezig…"
                                  : "Ontkoppel"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-small"
                                disabled={
                                  !configured ||
                                  oauthBusySellerId === connection.sellerId
                                }
                                onClick={() =>
                                  void connectGoogle(connection.sellerId)
                                }
                              >
                                {oauthBusySellerId === connection.sellerId
                                  ? "Bezig…"
                                  : "Connect Google"}
                              </button>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-body stack">
              <div>
                <h2 style={{ marginBottom: "0.35rem" }}>
                  Beschikbaarheidstest
                </h2>
                <p className="muted">
                  Kies een datum en uur om te zien wie op dat moment vrij is.
                </p>
              </div>

              <div className="form-grid two" style={{ maxWidth: 480 }}>
                <label>
                  Datum
                  <input
                    type="date"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Uur
                  <input
                    type="time"
                    value={testTime}
                    onChange={(e) => setTestTime(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={testing || loadingConnections || !configured}
                  onClick={() => void runAvailabilityTest()}
                >
                  {testing ? "Controleren…" : "Beschikbaarheid checken"}
                </button>
              </div>

              {availabilityResults ? (
                <div className="stack">
                  <p className="muted">
                    {availableCount} van {checkedCount} verkoper(s) beschikbaar
                    op {testDate} om {testTime}.
                  </p>
                  {availabilityResults.length === 0 ? (
                    <div className="empty">Nog geen actieve verkopers.</div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Verkoper</th>
                          <th>E-mail</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availabilityResults.map((row) => (
                          <tr key={row.sellerId}>
                            <td>{row.name}</td>
                            <td>{row.email}</td>
                            <td>
                              <span
                                className={
                                  row.available
                                    ? "badge badge-success"
                                    : "badge badge-danger"
                                }
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : activeTab === "domain" ? (
        <div className="stack">
          {error ? <p className="error">{error}</p> : null}

          <div className="panel">
            {loadingDomain ? (
              <div className="empty">Laden…</div>
            ) : (
              <form className="panel-body stack" onSubmit={saveDomain}>
                <div>
                  <h2 style={{ marginBottom: "0.35rem" }}>
                    Domeininstellingen
                  </h2>
                  <p className="muted">
                    Het toegestane domein voor de booking tool van{" "}
                    {domainEntityName || "deze entiteit"}. Leeg laten = geen
                    domeinrestrictie (handig tijdens development).
                  </p>
                </div>
                <label style={{ maxWidth: 420 }}>
                  Domein
                  <input
                    value={domainValue}
                    onChange={(e) => setDomainValue(e.target.value)}
                    placeholder="bijv. booking.belien.be"
                  />
                </label>
                <label className="switch-row">
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={maintenanceMode}
                      onChange={(e) => setMaintenanceMode(e.target.checked)}
                    />
                    <span className="switch-slider" />
                  </span>
                  <span>
                    <strong>
                      {maintenanceMode
                        ? "Onderhoud / coming soon aan"
                        : "Onderhoud / coming soon uit"}
                    </strong>
                    <span className="muted" style={{ display: "block" }}>
                      Bezoekers zien een coming soon-pagina i.p.v. de booking
                      flows.
                    </span>
                  </span>
                </label>
                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="submit"
                    className="btn"
                    disabled={savingDomain || (!entityId)}
                  >
                    {savingDomain ? "Opslaan…" : "Opslaan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : activeTab === "tracking" ? (
        <div className="stack">
          {error ? <p className="error">{error}</p> : null}

          <div className="panel">
            {loadingTracking ? (
              <div className="empty">Laden…</div>
            ) : (
              <form className="panel-body stack" onSubmit={saveTracking}>
                <div>
                  <h2 style={{ marginBottom: "0.35rem" }}>Tracking</h2>
                  <p className="muted">
                    Tracking en scripts voor de booking tool van{" "}
                    {trackingEntityName || "deze entiteit"}. Deze waarden gelden
                    enkel voor deze entiteit.
                  </p>
                </div>

                <label style={{ maxWidth: 420 }}>
                  GTM ID
                  <input
                    value={gtmId}
                    onChange={(e) => setGtmId(e.target.value)}
                    placeholder="GTM-XXXXXXX"
                    spellCheck={false}
                  />
                </label>

                <label>
                  Header scripts
                  <textarea
                    className="code-field"
                    rows={10}
                    value={headerScripts}
                    onChange={(e) => setHeaderScripts(e.target.value)}
                    placeholder={"<!-- bv. meta pixels / extra head scripts -->"}
                    spellCheck={false}
                  />
                </label>

                <label>
                  Footer scripts
                  <textarea
                    className="code-field"
                    rows={10}
                    value={footerScripts}
                    onChange={(e) => setFooterScripts(e.target.value)}
                    placeholder={"<!-- scripts net vóór </body> -->"}
                    spellCheck={false}
                  />
                </label>

                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="submit"
                    className="btn"
                    disabled={savingTracking || (!entityId)}
                  >
                    {savingTracking ? "Opslaan…" : "Opslaan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : activeTab === "content" ? (
        <div className="stack">
          {error ? <p className="error">{error}</p> : null}

          {loadingContent ? (
            <div className="panel">
              <div className="empty">Laden…</div>
            </div>
          ) : (
            <form className="stack" onSubmit={saveContent}>
              <div className="settings-blocks">
                <details className="settings-block" open>
                  <summary>
                    <span>Algemeen</span>
                    <span className="settings-block-chevron" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <div className="settings-block-body stack">
                    <label style={{ maxWidth: 420 }}>
                      Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          void onLogoChange(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    {uploadingLogo ? (
                      <p className="muted">Logo uploaden…</p>
                    ) : null}
                    {logoUrl ? (
                      <div className="stack">
                        <img
                          src={logoUrl}
                          alt="Logo"
                          style={{
                            maxWidth: 220,
                            maxHeight: 80,
                            objectFit: "contain",
                            border: "1px solid var(--line)",
                            borderRadius: 8,
                            padding: "0.5rem",
                            background: "#fff",
                          }}
                        />
                        <div
                          className="actions"
                          style={{ justifyContent: "flex-start" }}
                        >
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setLogoUrl("")}
                          >
                            Logo verwijderen
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <label style={{ maxWidth: 520 }}>
                      Openingszin
                      <textarea
                        value={introText}
                        onChange={(e) => setIntroText(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="bijv. Kies een bookingflow om te starten"
                      />
                    </label>

                    <div className="stack" style={{ gap: 6 }}>
                      <div>
                        Email body tekst
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {" "}
                          (extra tekst in de bevestigingsmail naar de klant)
                        </span>
                      </div>
                      <BasicWysiwyg
                        value={emailExtraTxt}
                        onChange={setEmailExtraTxt}
                        placeholder="Optionele tekst onderaan / in de bevestigingsmail…"
                      />
                    </div>
                  </div>
                </details>

                <details className="settings-block" open>
                  <summary>
                    <span>Stijlen</span>
                    <span className="settings-block-chevron" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <div className="settings-block-body stack">
                    <div className="color-fields">
                      <label>
                        Hoofdkleur
                        <span className="color-field">
                          <input
                            type="color"
                            value={primaryColor}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                          />
                          <input
                            type="text"
                            value={primaryColor}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                            maxLength={7}
                            placeholder="#121417"
                          />
                        </span>
                      </label>
                      <label>
                        Steunkleur
                        <span className="color-field">
                          <input
                            type="color"
                            value={secondaryColor}
                            onChange={(e) => setSecondaryColor(e.target.value)}
                          />
                          <input
                            type="text"
                            value={secondaryColor}
                            onChange={(e) => setSecondaryColor(e.target.value)}
                            maxLength={7}
                            placeholder="#667085"
                          />
                        </span>
                      </label>
                      <label>
                        Accentkleur
                        <span className="color-field">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                          />
                          <input
                            type="text"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            maxLength={7}
                            placeholder="#2766ab"
                          />
                        </span>
                      </label>
                    </div>
                  </div>
                </details>
              </div>

              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={
                    savingContent || uploadingLogo || (!entityId)
                  }
                >
                  {savingContent ? "Opslaan…" : "Opslaan"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
