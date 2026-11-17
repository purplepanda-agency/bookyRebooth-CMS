import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, uploadMedia } from "../api/client";
import type {
  Category,
  Flow,
  FlowStep,
  FlowStepType,
  Location,
  ProductSet,
} from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  cloneDefaultWebhookPayload,
  cloneSalesforceWebhookPayload,
  createEmptyWebhook,
  formatWebhookPayloadJson,
  normalizeWebhooksFromConfig,
  type FlowWebhookConfig,
} from "../lib/webhookDefaults";

type DraftStep = FlowStep & { key: string };
type ConfirmationDraft = Extract<FlowStep, { type: "CONFIRMATION" }> & {
  key: string;
};
type SlideMode = "pick" | "configure";
type BuilderTab = "builder" | "settings" | "webhooks";
type SelectOption = { value: string; label: string };

function normalizeStep(step: FlowStep): FlowStep {
  if (step.type === "PRODUCT_SET") {
    return {
      ...step,
      config: {
        title: step.config.title ?? "",
        productSetId: step.config.productSetId ?? "",
        allowNoProduct: step.config.allowNoProduct ?? false,
        noProductTitle: step.config.noProductTitle ?? "",
        noProductImageUrl: step.config.noProductImageUrl ?? null,
      },
    };
  }
  if (step.type === "LOCATIONS") {
    return {
      ...step,
      config: {
        title: step.config.title ?? "",
        locationIds: step.config.locationIds ?? [],
        showImage: step.config.showImage ?? true,
        imageFit: step.config.imageFit === "cover" ? "cover" : "contain",
      },
    };
  }
  if (step.type === "CATEGORIES") {
    return {
      ...step,
      config: {
        title: step.config.title ?? "",
        categoryIds: step.config.categoryIds ?? [],
        showImage: step.config.showImage ?? true,
        imageFit: step.config.imageFit === "cover" ? "cover" : "contain",
      },
    };
  }
  if (step.type === "CONFIRMATION") {
    return {
      ...step,
      config: {
        title: step.config.title?.trim() || "Persoonlijke gegevens",
        webhooks: normalizeWebhooksFromConfig(
          step.config as unknown as Record<string, unknown>,
        ),
      },
    };
  }
  return step;
}

function createConfirmationStep(existing?: FlowStep): ConfirmationDraft {
  const normalized =
    existing?.type === "CONFIRMATION"
      ? (normalizeStep(existing) as Extract<FlowStep, { type: "CONFIRMATION" }>)
      : ({
          type: "CONFIRMATION",
          config: {
            title: "Persoonlijke gegevens",
            webhooks: [],
          },
        } satisfies Extract<FlowStep, { type: "CONFIRMATION" }>);
  return {
    ...normalized,
    key:
      existing?.type === "CONFIRMATION" && existing.id
        ? existing.id
        : crypto.randomUUID(),
  };
}

function payloadTextsFromWebhooks(webhooks: FlowWebhookConfig[]) {
  return Object.fromEntries(
    webhooks.map((webhook) => [
      webhook.id,
      formatWebhookPayloadJson(webhook.payload),
    ]),
  );
}

const BLOCKS: Array<{
  type: FlowStepType;
  title: string;
  description: string;
}> = [
  {
    type: "FREE_CHOICE",
    title: "Vrije keuze toevoegen",
    description: "Eigen opties met naam, slug en optionele afbeelding.",
  },
  {
    type: "PRODUCT_SET",
    title: "Product set",
    description: "Kies één globale product set.",
  },
  {
    type: "LOCATIONS",
    title: "Locaties",
    description: "Selecteer één of meer locaties van jouw entiteit.",
  },
  {
    type: "CATEGORIES",
    title: "Categorieën",
    description: "Selecteer één of meer categorieën van jouw entiteit.",
  },
  {
    type: "SELLERS_AGENDA",
    title: "Verkopers agenda's",
    description: "Beschikbare verkopers worden automatisch opgehaald.",
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createDraftStep(type: FlowStepType): DraftStep {
  const key = crypto.randomUUID();
  switch (type) {
    case "FREE_CHOICE":
      return {
        key,
        type,
        config: { options: [{ name: "", slug: "", imageUrl: null }] },
      };
    case "PRODUCT_SET":
      return {
        key,
        type,
        config: {
          title: "",
          productSetId: "",
          allowNoProduct: false,
          noProductTitle: "",
          noProductImageUrl: null,
        },
      };
    case "LOCATIONS":
      return {
        key,
        type,
        config: {
          title: "",
          locationIds: [],
          showImage: true,
          imageFit: "contain",
        },
      };
    case "CATEGORIES":
      return {
        key,
        type,
        config: {
          title: "",
          categoryIds: [],
          showImage: true,
          imageFit: "contain",
        },
      };
    case "SELLERS_AGENDA":
      return { key, type, config: {} };
    case "CONFIRMATION":
      return {
        key,
        type,
        config: {
          title: "Persoonlijke gegevens",
          webhooks: [],
        },
      };
  }
}

function stepTitle(type: FlowStepType) {
  if (type === "CONFIRMATION") return "Bevestiging";
  return BLOCKS.find((block) => block.type === type)?.title ?? type;
}

function IconChevronUp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.4 15.4 6 14l6-6 6 6-1.4 1.4L12 10.8z"
      />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"
      />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.3V21h3.7L17.8 9.9l-3.7-3.7L3 17.3zm17.7-10.4c.4-.4.4-1 0-1.4l-2.2-2.2c-.4-.4-1-.4-1.4 0l-1.7 1.7 3.7 3.7 1.6-1.8z"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a1 1 0 0 0 1-1V8H5v12a1 1 0 0 0 1 1z"
      />
    </svg>
  );
}

export function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [featuredImage, setFeaturedImage] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [entitySlug, setEntitySlug] = useState(
    user?.entities?.[0]?.slug || "global",
  );
  const [uploadingFeatured, setUploadingFeatured] = useState(false);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [confirmationStep, setConfirmationStep] =
    useState<ConfirmationDraft>(() => createConfirmationStep());
  const [productSets, setProductSets] = useState<ProductSet[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slideOpen, setSlideOpen] = useState(false);
  const [slideMode, setSlideMode] = useState<SlideMode>("pick");
  const [draftStep, setDraftStep] = useState<DraftStep | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [webhookPayloadTexts, setWebhookPayloadTexts] = useState<
    Record<string, string>
  >({});
  const [uploadingOptionIndex, setUploadingOptionIndex] = useState<
    number | null
  >(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>("builder");

  const locationOptions = useMemo<SelectOption[]>(
    () =>
      locations.map((location) => ({
        value: location.id,
        label: location.name,
      })),
    [locations],
  );

  const categoryOptions = useMemo<SelectOption[]>(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const flowData = await api<{ flow: Flow }>(`/flows/${id}`);
        if (cancelled) return;

        const flow = flowData.flow;
        setName(flow.name);
        setSlug(flow.slug || slugify(flow.name));
        setSlugTouched(Boolean(flow.slug));
        setFeaturedImage(flow.featuredImage);
        setActive(flow.active);
        setEntitySlug(flow.entity?.slug || "global");

        const productSetsData = await api<{ productSets: ProductSet[] }>(
          `/product-sets?entityId=${encodeURIComponent(flow.entityId)}`,
        );
        if (cancelled) return;
        setProductSets(productSetsData.productSets);
        const loadedSteps = flow.steps ?? [];
        const existingConfirmation = loadedSteps.find(
          (step) => step.type === "CONFIRMATION",
        );
        const nextConfirmation = createConfirmationStep(existingConfirmation);
        setConfirmationStep(nextConfirmation);
        setWebhookPayloadTexts(
          payloadTextsFromWebhooks(nextConfirmation.config.webhooks),
        );
        setSteps(
          loadedSteps
            .filter((step) => step.type !== "CONFIRMATION")
            .map((step) => ({
              ...normalizeStep(step),
              key: step.id ?? crypto.randomUUID(),
            })),
        );

        const [locationsData, categoriesData] = await Promise.all([
          api<{ locations: Location[] }>(
            `/locations?entityId=${encodeURIComponent(flow.entityId)}`,
          ),
          api<{ categories: Category[] }>(
            `/categories?entityId=${encodeURIComponent(flow.entityId)}`,
          ),
        ]);
        if (!cancelled) {
          setLocations(locationsData.locations);
          setCategories(categoriesData.categories);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function openPicker() {
    setEditingKey(null);
    setDraftStep(null);
    setSlideMode("pick");
    setSlideOpen(true);
  }

  function openConfigure(type: FlowStepType) {
    setDraftStep(createDraftStep(type));
    setSlideMode("configure");
  }

  function openEdit(step: DraftStep) {
    setEditingKey(step.key);
    setDraftStep({
      ...structuredClone(normalizeStep(step)),
      key: step.key,
    } as DraftStep);
    setSlideMode("configure");
    setSlideOpen(true);
  }

  function closeSlide() {
    setSlideOpen(false);
    setSlideMode("pick");
    setDraftStep(null);
    setEditingKey(null);
  }

  function updateConfirmationWebhooks(
    updater: (webhooks: FlowWebhookConfig[]) => FlowWebhookConfig[],
  ) {
    setConfirmationStep((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        webhooks: updater(prev.config.webhooks),
      },
    }));
  }

  function resolveWebhooksForSave():
    | { ok: true; webhooks: FlowWebhookConfig[] }
    | { ok: false; error: string } {
    const webhooks: FlowWebhookConfig[] = [];

    for (const [index, webhook] of confirmationStep.config.webhooks.entries()) {
      const url = webhook.url.trim();
      const name = webhook.name.trim();
      const label = name || `Webhook ${index + 1}`;

      if (!url && !name) continue;

      if (!url) {
        return { ok: false, error: `${label}: vul een webhook-URL in` };
      }

      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        return { ok: false, error: `${label}: ongeldige webhook-URL` };
      }

      let payload: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(
          webhookPayloadTexts[webhook.id] ??
            formatWebhookPayloadJson(webhook.payload),
        );
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {
            ok: false,
            error: `${label}: data moet een JSON-object zijn ({ … })`,
          };
        }
        payload = parsed as Record<string, unknown>;
      } catch {
        return { ok: false, error: `${label}: data is geen geldige JSON` };
      }

      webhooks.push({
        id: webhook.id || crypto.randomUUID(),
        name,
        url,
        payload,
      });
    }

    return { ok: true, webhooks };
  }

  function confirmDraftStep() {
    if (!draftStep) return;

    if (draftStep.type === "CONFIRMATION") {
      const title = draftStep.config.title.trim() || "Persoonlijke gegevens";
      setConfirmationStep({
        id: draftStep.id ?? confirmationStep.id,
        type: "CONFIRMATION",
        key: confirmationStep.key,
        config: {
          title,
          webhooks: confirmationStep.config.webhooks,
        },
      });
      setError(null);
      closeSlide();
      return;
    }

    if (draftStep.type === "FREE_CHOICE") {
      const options = draftStep.config.options.filter(
        (option) => option.name.trim() && option.slug.trim(),
      );
      if (options.length === 0) {
        setError("Voeg minstens één optie toe met naam en slug");
        return;
      }
      draftStep.config.options = options;
    }

    if (draftStep.type === "PRODUCT_SET") {
      if (!draftStep.config.title.trim()) {
        setError("Vul een titel in");
        return;
      }
      if (!draftStep.config.productSetId) {
        setError("Kies een product set");
        return;
      }
      if (
        draftStep.config.allowNoProduct &&
        !draftStep.config.noProductTitle.trim()
      ) {
        setError("Vul een titel in voor ‘geen keuze’");
        return;
      }
      draftStep.config.title = draftStep.config.title.trim();
      draftStep.config.noProductTitle = draftStep.config.noProductTitle.trim();
      if (!draftStep.config.allowNoProduct) {
        draftStep.config.noProductTitle = "";
        draftStep.config.noProductImageUrl = null;
      }
    }

    if (draftStep.type === "LOCATIONS") {
      if (!draftStep.config.title.trim()) {
        setError("Vul een titel in");
        return;
      }
      if (draftStep.config.locationIds.length === 0) {
        setError("Selecteer minstens één locatie");
        return;
      }
      draftStep.config.title = draftStep.config.title.trim();
    }

    if (draftStep.type === "CATEGORIES") {
      if (!draftStep.config.title.trim()) {
        setError("Vul een titel in");
        return;
      }
      if (draftStep.config.categoryIds.length === 0) {
        setError("Selecteer minstens één categorie");
        return;
      }
      draftStep.config.title = draftStep.config.title.trim();
    }

    setError(null);
    setSteps((prev) => {
      if (editingKey) {
        return prev.map((step) =>
          step.key === editingKey ? { ...draftStep, key: editingKey } : step,
        );
      }
      return [...prev, { ...draftStep, key: crypto.randomUUID() }];
    });
    closeSlide();
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((step) => step.key !== key));
  }

  function moveStep(key: string, direction: -1 | 1) {
    setSteps((prev) => {
      const index = prev.findIndex((step) => step.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  async function saveFlow() {
    if (!id) return;
    if (!name.trim()) {
      setError("Naam is verplicht");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is verplicht");
      setActiveTab("settings");
      return;
    }

    const resolvedWebhooks = resolveWebhooksForSave();
    if (!resolvedWebhooks.ok) {
      setError(resolvedWebhooks.error);
      setActiveTab("webhooks");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const data = await api<{ flow: Flow }>(`/flows/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          featuredImage,
          active,
          steps: [
            ...steps.map(({ id, type, config }) => ({
              ...(id ? { id } : {}),
              type,
              config,
            })),
            {
              ...(confirmationStep.id ? { id: confirmationStep.id } : {}),
              type: "CONFIRMATION" as const,
              config: {
                title:
                  confirmationStep.config.title.trim() ||
                  "Persoonlijke gegevens",
                webhooks: resolvedWebhooks.webhooks,
                // Spiegel eerste webhook naar legacy-velden (compat oudere API)
                webhookUrl: resolvedWebhooks.webhooks[0]?.url ?? "",
                webhookName: resolvedWebhooks.webhooks[0]?.name ?? "",
                webhookPayload:
                  resolvedWebhooks.webhooks[0]?.payload ?? null,
              },
            },
          ],
        }),
      });

      const savedSteps = data.flow.steps ?? [];
      const savedConfirmation = savedSteps.find(
        (step) => step.type === "CONFIRMATION",
      );
      const nextConfirmation = createConfirmationStep(savedConfirmation);
      setConfirmationStep(nextConfirmation);
      setWebhookPayloadTexts(
        payloadTextsFromWebhooks(nextConfirmation.config.webhooks),
      );
      setSteps(
        savedSteps
          .filter((step) => step.type !== "CONFIRMATION")
          .map((step) => ({
            ...normalizeStep(step),
            key: step.id ?? crypto.randomUUID(),
          })),
      );
      navigate("/new-flow");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function uploadOptionImage(index: number, file: File | null) {
    if (!file || !draftStep || draftStep.type !== "FREE_CHOICE") return;
    setUploadingOptionIndex(index);
    setError(null);
    try {
      const url = await uploadMedia(file, entitySlug);
      setDraftStep({
        ...draftStep,
        config: {
          options: draftStep.config.options.map((option, optionIndex) =>
            optionIndex === index ? { ...option, imageUrl: url } : option,
          ),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploadingOptionIndex(null);
    }
  }

  async function uploadNoProductImage(file: File | null) {
    if (!file || !draftStep || draftStep.type !== "PRODUCT_SET") return;
    setUploadingOptionIndex(-1);
    setError(null);
    try {
      const url = await uploadMedia(file, entitySlug);
      setDraftStep({
        ...draftStep,
        config: {
          ...draftStep.config,
          noProductImageUrl: url,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploadingOptionIndex(null);
    }
  }

  function stepSummaryParts(step: DraftStep): {
    title: string | null;
    labels: string[];
  } {
    if (step.type === "FREE_CHOICE") {
      return {
        title: null,
        labels: [`${step.config.options.length} optie(s)`],
      };
    }
    if (step.type === "PRODUCT_SET") {
      const setName =
        productSets.find((item) => item.id === step.config.productSetId)
          ?.name || "Geen product set";
      return {
        title: step.config.title || null,
        labels: [
          setName,
          ...(step.config.allowNoProduct ? ["+ geen keuze"] : []),
        ],
      };
    }
    if (step.type === "LOCATIONS") {
      return {
        title: step.config.title || null,
        labels: [`${step.config.locationIds.length} locatie(s)`],
      };
    }
    if (step.type === "CATEGORIES") {
      return {
        title: step.config.title || null,
        labels: [`${step.config.categoryIds.length} categorie(ën)`],
      };
    }
    if (step.type === "CONFIRMATION") {
      return {
        title: step.config.title || "Persoonlijke gegevens",
        labels: ["Vast laatste blok"],
      };
    }
    return {
      title: null,
      labels: ["Automatisch uit systeem"],
    };
  }

  if (loading) {
    return <div className="empty">Laden…</div>;
  }

  return (
    <div className={slideOpen ? "flow-page with-slide" : "flow-page"}>
      <div className="page-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            <Link to="/new-flow">← Terug naar overzicht</Link>
          </p>
          <input
            className="page-title-input"
            value={name}
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              if (!slugTouched) {
                setSlug(slugify(nextName));
              }
            }}
            placeholder="Naam van de flow"
            aria-label="Naam van de flow"
          />
          <p>Bouw de stappen van deze bookingflow.</p>
        </div>
        <div className="page-header-actions">
          <label
            className="switch-row switch-row-compact"
            title={active ? "Actief" : "Inactief"}
          >
            <span className="switch">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                aria-label={active ? "Deactiveer flow" : "Activeer flow"}
              />
              <span className="switch-slider" />
            </span>
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => void saveFlow()}
            disabled={saving}
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Flow secties">
        <button
          type="button"
          role="tab"
          className={activeTab === "builder" ? "tab active" : "tab"}
          aria-selected={activeTab === "builder"}
          onClick={() => setActiveTab("builder")}
        >
          Flow builder
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === "settings" ? "tab active" : "tab"}
          aria-selected={activeTab === "settings"}
          onClick={() => setActiveTab("settings")}
        >
          Flow settings
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === "webhooks" ? "tab active" : "tab"}
          aria-selected={activeTab === "webhooks"}
          onClick={() => setActiveTab("webhooks")}
        >
          Webhooks
        </button>
      </div>

      {activeTab === "builder" ? (
        <div className="panel flow-canvas">
          <div className="flow-track">
            {steps.map((step, index) => {
              const summary = stepSummaryParts(step);
              return (
              <div key={step.key} className="flow-step-wrap">
                {index > 0 ? (
                  <div className="flow-connector" aria-hidden="true" />
                ) : null}
                <div className="flow-step-card">
                  <div className="flow-step-head">
                    <div className="flow-step-meta">
                      <strong>{stepTitle(step.type)}</strong>
                      {summary.title ? (
                        <p className="flow-step-title">{summary.title}</p>
                      ) : null}
                      {summary.labels.length > 0 ? (
                        <div className="flow-step-labels">
                          {summary.labels.map((label) => (
                            <span key={label} className="flow-step-label">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Omhoog"
                        aria-label="Omhoog"
                        disabled={index === 0}
                        onClick={() => moveStep(step.key, -1)}
                      >
                        <IconChevronUp />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Omlaag"
                        aria-label="Omlaag"
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(step.key, 1)}
                      >
                        <IconChevronDown />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Bewerken"
                        aria-label="Bewerken"
                        onClick={() => openEdit(step)}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Verwijderen"
                        aria-label="Verwijderen"
                        onClick={() => removeStep(step.key)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}

            {steps.length > 0 ? (
              <div className="flow-connector" aria-hidden="true" />
            ) : null}

            <button type="button" className="flow-add-btn" onClick={openPicker}>
              <span className="add-product-circle">+</span>
              <span>Voeg stap toe</span>
            </button>

            {steps.length === 0 ? (
              <p className="muted" style={{ textAlign: "center" }}>
                Nog geen stappen. Klik op “Voeg stap toe” om te beginnen.
              </p>
            ) : null}

            <div className="flow-connector" aria-hidden="true" />
            <div className="flow-step-wrap">
              <div className="flow-step-card flow-step-card-locked">
                <div className="flow-step-head">
                  <div className="flow-step-meta">
                    <strong>{stepTitle("CONFIRMATION")}</strong>
                    <p className="flow-step-title">
                      {confirmationStep.config.title || "Persoonlijke gegevens"}
                    </p>
                    <div className="flow-step-labels">
                      <span className="flow-step-label">Vast laatste blok</span>
                      {confirmationStep.config.webhooks.length > 0 ? (
                        <span className="flow-step-label">
                          {confirmationStep.config.webhooks.length === 1
                            ? confirmationStep.config.webhooks[0]?.name
                              ? `Webhook: ${confirmationStep.config.webhooks[0].name}`
                              : "1 webhook"
                            : `${confirmationStep.config.webhooks.length} webhooks`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Bewerken"
                      aria-label="Bewerken"
                      onClick={() => openEdit(confirmationStep)}
                    >
                      <IconPencil />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="panel">
          <div className="panel-body stack" style={{ maxWidth: 520 }}>
            <label>
              Flow slug
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="bijv. bmw-proefrit"
                required
              />
            </label>

            <label>
              Featured image
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) return;
                  setUploadingFeatured(true);
                  setError(null);
                  try {
                    const url = await uploadMedia(file, entitySlug);
                    setFeaturedImage(url);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Upload mislukt",
                    );
                  } finally {
                    setUploadingFeatured(false);
                  }
                }}
              />
            </label>

            {uploadingFeatured ? (
              <p className="muted">Afbeelding uploaden…</p>
            ) : null}

            {featuredImage ? (
              <div className="stack">
                <img
                  src={featuredImage}
                  alt="Featured"
                  style={{
                    width: "100%",
                    maxWidth: 360,
                    height: 200,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                  }}
                />
                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => setFeaturedImage(null)}
                  >
                    Afbeelding verwijderen
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "webhooks" ? (
        <div className="panel">
          <div className="panel-body stack">
            <div
              className="actions"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong>Webhooks</strong>
                <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                  Na een succesvolle booking wordt de JSON naar elk endpoint
                  gestuurd. Gebruik <code>{"{{veld}}"}</code> voor dynamische
                  waarden.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  const next = createEmptyWebhook();
                  updateConfirmationWebhooks((webhooks) => [...webhooks, next]);
                  setWebhookPayloadTexts((prev) => ({
                    ...prev,
                    [next.id]: formatWebhookPayloadJson(next.payload),
                  }));
                }}
              >
                + Webhook
              </button>
            </div>

            {confirmationStep.config.webhooks.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nog geen webhooks. Klik op “+ Webhook” om er een toe te voegen.
              </p>
            ) : (
              <div className="webhook-grid">
                {confirmationStep.config.webhooks.map((webhook, index) => (
                  <div
                    key={webhook.id}
                    className="settings-block webhook-card"
                  >
                    <div className="stack">
                      <div
                        className="actions"
                        style={{
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <strong>Webhook {index + 1}</strong>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Verwijderen"
                          aria-label={`Webhook ${index + 1} verwijderen`}
                          onClick={() => {
                            updateConfirmationWebhooks((webhooks) =>
                              webhooks.filter((item) => item.id !== webhook.id),
                            );
                            setWebhookPayloadTexts((prev) => {
                              const next = { ...prev };
                              delete next[webhook.id];
                              return next;
                            });
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                      <label>
                        Naam
                        <input
                          value={webhook.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            updateConfirmationWebhooks((webhooks) =>
                              webhooks.map((item) =>
                                item.id === webhook.id
                                  ? { ...item, name }
                                  : item,
                              ),
                            );
                          }}
                          placeholder="bijv. CRM sync"
                        />
                      </label>
                      <label>
                        URL
                        <input
                          value={webhook.url}
                          onChange={(e) => {
                            const url = e.target.value;
                            updateConfirmationWebhooks((webhooks) =>
                              webhooks.map((item) =>
                                item.id === webhook.id
                                  ? { ...item, url }
                                  : item,
                              ),
                            );
                          }}
                          placeholder="https://…"
                          spellCheck={false}
                        />
                      </label>
                      <label>
                        Data (JSON)
                        <textarea
                          className="code-field"
                          rows={18}
                          value={
                            webhookPayloadTexts[webhook.id] ??
                            formatWebhookPayloadJson(webhook.payload)
                          }
                          onChange={(e) =>
                            setWebhookPayloadTexts((prev) => ({
                              ...prev,
                              [webhook.id]: e.target.value,
                            }))
                          }
                          spellCheck={false}
                        />
                      </label>
                      <div
                        className="actions"
                        style={{
                          justifyContent: "flex-start",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() =>
                            setWebhookPayloadTexts((prev) => ({
                              ...prev,
                              [webhook.id]: formatWebhookPayloadJson(
                                cloneDefaultWebhookPayload(),
                              ),
                            }))
                          }
                        >
                          Standaard JSON
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() =>
                            setWebhookPayloadTexts((prev) => ({
                              ...prev,
                              [webhook.id]: formatWebhookPayloadJson(
                                cloneSalesforceWebhookPayload(),
                              ),
                            }))
                          }
                        >
                          Salesforce JSON
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {slideOpen ? (
        <>
          <button
            type="button"
            className="slideout-backdrop"
            aria-label="Sluit panel"
            onClick={closeSlide}
          />
          <aside className="slideout">
            <div className="slideout-header">
              <div>
                <h2>
                  {slideMode === "pick"
                    ? "Stap toevoegen"
                    : editingKey
                      ? "Stap bewerken"
                      : draftStep
                        ? stepTitle(draftStep.type)
                        : "Configureer stap"}
                </h2>
                <p className="muted">
                  {slideMode === "pick"
                    ? "Kies een builderblok"
                    : "Vul de instellingen in"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={closeSlide}
              >
                Sluiten
              </button>
            </div>

            <div className="slideout-body stack">
              {slideMode === "pick" ? (
                BLOCKS.map((block) => (
                  <button
                    key={block.type}
                    type="button"
                    className="builder-block"
                    onClick={() => openConfigure(block.type)}
                  >
                    <strong>{block.title}</strong>
                    <span className="muted">{block.description}</span>
                  </button>
                ))
              ) : draftStep ? (
                <>
                  {draftStep.type === "FREE_CHOICE" ? (
                    <div className="stack">
                      <div className="flow-step-head">
                        <h3>Opties</h3>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                options: [
                                  ...draftStep.config.options,
                                  { name: "", slug: "", imageUrl: null },
                                ],
                              },
                            })
                          }
                        >
                          Optie toevoegen
                        </button>
                      </div>

                      {draftStep.config.options.map((option, index) => (
                        <div
                          key={`option-${index}`}
                          className="repeater-item"
                        >
                          <div className="panel-body stack">
                            <div className="form-grid two">
                              <label>
                                Naam
                                <input
                                  value={option.name}
                                  onChange={(e) => {
                                    const nextName = e.target.value;
                                    setDraftStep({
                                      ...draftStep,
                                      config: {
                                        options: draftStep.config.options.map(
                                          (item, itemIndex) =>
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  name: nextName,
                                                  slug: item.slug
                                                    ? item.slug
                                                    : slugify(nextName),
                                                }
                                              : item,
                                        ),
                                      },
                                    });
                                  }}
                                />
                              </label>
                              <label>
                                Slug
                                <input
                                  value={option.slug}
                                  onChange={(e) =>
                                    setDraftStep({
                                      ...draftStep,
                                      config: {
                                        options: draftStep.config.options.map(
                                          (item, itemIndex) =>
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  slug: e.target.value,
                                                }
                                              : item,
                                        ),
                                      },
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label>
                              Afbeelding (optioneel)
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  void uploadOptionImage(
                                    index,
                                    e.target.files?.[0] ?? null,
                                  )
                                }
                              />
                            </label>
                            {uploadingOptionIndex === index ? (
                              <p className="muted">Uploaden…</p>
                            ) : null}
                            {option.imageUrl ? (
                              <img
                                src={option.imageUrl}
                                alt={option.name || "Optie"}
                                className="repeater-preview"
                              />
                            ) : null}
                            {draftStep.config.options.length > 1 ? (
                              <div className="actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  onClick={() =>
                                    setDraftStep({
                                      ...draftStep,
                                      config: {
                                        options:
                                          draftStep.config.options.filter(
                                            (_item, itemIndex) =>
                                              itemIndex !== index,
                                          ),
                                      },
                                    })
                                  }
                                >
                                  Optie verwijderen
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {draftStep.type === "PRODUCT_SET" ? (
                    <div className="stack">
                      <label>
                        Titel
                        <input
                          value={draftStep.config.title}
                          onChange={(e) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                title: e.target.value,
                              },
                            })
                          }
                          placeholder="bijv. Kies een model"
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Product set
                        <select
                          value={draftStep.config.productSetId}
                          onChange={(e) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                productSetId: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Kies product set…</option>
                          {productSets.map((set) => (
                            <option key={set.id} value={set.id}>
                              {set.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="switch-row switch-row-compact">
                        <span className="switch">
                          <input
                            type="checkbox"
                            checked={draftStep.config.allowNoProduct}
                            onChange={(e) =>
                              setDraftStep({
                                ...draftStep,
                                config: {
                                  ...draftStep.config,
                                  allowNoProduct: e.target.checked,
                                },
                              })
                            }
                          />
                          <span className="switch-slider" />
                        </span>
                        <span>Geen keuze toestaan</span>
                      </label>
                      {draftStep.config.allowNoProduct ? (
                        <div className="stack">
                          <label>
                            Titel ‘geen keuze’
                            <input
                              value={draftStep.config.noProductTitle}
                              onChange={(e) =>
                                setDraftStep({
                                  ...draftStep,
                                  config: {
                                    ...draftStep.config,
                                    noProductTitle: e.target.value,
                                  },
                                })
                              }
                              placeholder="bijv. Ik weet het nog niet"
                              maxLength={120}
                            />
                          </label>
                          <label>
                            Afbeelding ‘geen keuze’
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                void uploadNoProductImage(
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </label>
                          {uploadingOptionIndex === -1 ? (
                            <p className="muted">Afbeelding uploaden…</p>
                          ) : null}
                          {draftStep.config.noProductImageUrl ? (
                            <div className="stack">
                              <img
                                src={draftStep.config.noProductImageUrl}
                                alt=""
                                style={{
                                  maxWidth: 180,
                                  maxHeight: 100,
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
                                  onClick={() =>
                                    setDraftStep({
                                      ...draftStep,
                                      config: {
                                        ...draftStep.config,
                                        noProductImageUrl: null,
                                      },
                                    })
                                  }
                                >
                                  Afbeelding verwijderen
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {draftStep.type === "LOCATIONS" ? (
                    <div className="stack">
                      <label>
                        Titel
                        <input
                          value={draftStep.config.title}
                          onChange={(e) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                title: e.target.value,
                              },
                            })
                          }
                          placeholder="bijv. Kies een locatie"
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Locaties
                        <Select
                          isMulti
                          classNamePrefix="rs"
                          options={locationOptions}
                          value={locationOptions.filter((option) =>
                            draftStep.config.locationIds.includes(option.value),
                          )}
                          onChange={(selected) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                locationIds: selected.map(
                                  (option) => option.value,
                                ),
                              },
                            })
                          }
                          placeholder="Selecteer locaties…"
                          noOptionsMessage={() => "Geen locaties"}
                        />
                      </label>
                      <label className="switch-row switch-row-compact">
                        <span className="switch">
                          <input
                            type="checkbox"
                            checked={draftStep.config.showImage}
                            onChange={(e) =>
                              setDraftStep({
                                ...draftStep,
                                config: {
                                  ...draftStep.config,
                                  showImage: e.target.checked,
                                },
                              })
                            }
                          />
                          <span className="switch-slider" />
                        </span>
                        <span>Afbeelding tonen</span>
                      </label>
                      {draftStep.config.showImage ? (
                        <label>
                          Afbeeldingsweergave
                          <select
                            value={draftStep.config.imageFit}
                            onChange={(e) =>
                              setDraftStep({
                                ...draftStep,
                                config: {
                                  ...draftStep.config,
                                  imageFit:
                                    e.target.value === "cover"
                                      ? "cover"
                                      : "contain",
                                },
                              })
                            }
                          >
                            <option value="contain">
                              Afbeelding ratio behouden
                            </option>
                            <option value="cover">Afbeelding uitvullen</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  {draftStep.type === "CATEGORIES" ? (
                    <div className="stack">
                      <label>
                        Titel
                        <input
                          value={draftStep.config.title}
                          onChange={(e) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                title: e.target.value,
                              },
                            })
                          }
                          placeholder="bijv. Kies een categorie"
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Categorieën
                        <Select
                          isMulti
                          classNamePrefix="rs"
                          options={categoryOptions}
                          value={categoryOptions.filter((option) =>
                            draftStep.config.categoryIds.includes(option.value),
                          )}
                          onChange={(selected) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                categoryIds: selected.map(
                                  (option) => option.value,
                                ),
                              },
                            })
                          }
                          placeholder="Selecteer categorieën…"
                          noOptionsMessage={() => "Geen categorieën"}
                        />
                      </label>
                      <label className="switch-row switch-row-compact">
                        <span className="switch">
                          <input
                            type="checkbox"
                            checked={draftStep.config.showImage}
                            onChange={(e) =>
                              setDraftStep({
                                ...draftStep,
                                config: {
                                  ...draftStep.config,
                                  showImage: e.target.checked,
                                },
                              })
                            }
                          />
                          <span className="switch-slider" />
                        </span>
                        <span>Afbeelding tonen</span>
                      </label>
                      {draftStep.config.showImage ? (
                        <label>
                          Afbeeldingsweergave
                          <select
                            value={draftStep.config.imageFit}
                            onChange={(e) =>
                              setDraftStep({
                                ...draftStep,
                                config: {
                                  ...draftStep.config,
                                  imageFit:
                                    e.target.value === "cover"
                                      ? "cover"
                                      : "contain",
                                },
                              })
                            }
                          >
                            <option value="contain">
                              Afbeelding ratio behouden
                            </option>
                            <option value="cover">Afbeelding uitvullen</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  {draftStep.type === "SELLERS_AGENDA" ? (
                    <div className="info-box">
                      De beschikbare verkopers worden automatisch opgehaald uit
                      het systeem.
                    </div>
                  ) : null}

                  {draftStep.type === "CONFIRMATION" ? (
                    <div className="stack">
                      <div className="info-box">
                        Dit blok staat altijd vast onderaan de flow. Pas hier de
                        titel boven het bevestigingsformulier aan. Webhooks
                        configureer je in de tab Webhooks.
                      </div>
                      <label>
                        Formuliertitel
                        <input
                          value={draftStep.config.title}
                          onChange={(e) =>
                            setDraftStep({
                              ...draftStep,
                              config: {
                                ...draftStep.config,
                                title: e.target.value,
                              },
                            })
                          }
                          placeholder="Persoonlijke gegevens"
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="actions">
                    {!editingKey ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setSlideMode("pick")}
                      >
                        Terug
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      onClick={confirmDraftStep}
                      disabled={uploadingOptionIndex !== null}
                    >
                      {editingKey ? "Bijwerken" : "Toevoegen aan flow"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
