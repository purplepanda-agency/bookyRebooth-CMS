import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSampleWebhookContext,
  buildWebhookVariableGroups,
  cloneDefaultWebhookPayload,
  cloneSalesforceWebhookPayload,
  formatWebhookPayloadJson,
  previewWebhookPayloadJson,
  type SampleWebhookBookingExtras,
} from "../lib/webhookDefaults";

type FlowStepHint = {
  type: string;
  title?: string;
  sampleName?: string;
  sampleSlug?: string;
};

type Props = {
  webhookId: string;
  webhookName: string;
  value: string;
  onChange: (next: string) => void;
  flowSteps: FlowStepHint[];
  sampleExtras?: SampleWebhookBookingExtras;
};

function IconVariables() {
  return (
    <span aria-hidden="true" className="webhook-var-trigger-glyph">
      {"{ }"}
    </span>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
    >
      <path fill="currentColor" d="M9 6.5 15.5 12 9 17.5z" />
    </svg>
  );
}

export function WebhookPayloadEditor({
  webhookId,
  webhookName,
  value,
  onChange,
  flowSteps,
  sampleExtras,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const groups = useMemo(
    () => buildWebhookVariableGroups(flowSteps),
    [flowSteps],
  );

  useEffect(() => {
    // Open eerste stap-groep standaard, anders BOOKING
    const firstId = groups[0]?.id;
    if (!firstId) return;
    setOpenGroups((prev) =>
      Object.keys(prev).length > 0 ? prev : { [firstId]: true },
    );
  }, [groups]);

  useEffect(() => {
    if (!pickerOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (pickerRef.current?.contains(target)) return;
      setPickerOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const sampleContext = useMemo(
    () =>
      buildSampleWebhookContext(flowSteps, {
        ...sampleExtras,
        webhookName:
          webhookName || sampleExtras?.webhookName || "Voorbeeld webhook",
      }),
    [flowSteps, webhookName, sampleExtras],
  );

  const preview = useMemo(
    () => previewWebhookPayloadJson(value, sampleContext),
    [value, sampleContext],
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.key.toLowerCase().includes(q) ||
            item.label.toLowerCase().includes(q) ||
            group.title.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, search]);

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${token}`);
      setPickerOpen(false);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    setPickerOpen(false);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="stack webhook-payload-editor">
      <div className="webhook-data-split">
        <div className="webhook-data-pane">
          <span>Data (JSON)</span>
          <div className="webhook-code-wrap">
            <textarea
              ref={textareaRef}
              className="code-field webhook-code-field"
              rows={26}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className={`webhook-var-trigger${pickerOpen ? " is-open" : ""}`}
              title="Variabelen invoegen"
              aria-label="Variabelen invoegen"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
            >
              <IconVariables />
            </button>

            {pickerOpen ? (
              <div
                ref={pickerRef}
                className="webhook-var-picker"
                role="dialog"
                aria-label="Variabelen"
              >
                <input
                  className="webhook-var-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek variabele"
                  autoFocus
                />
                <div className="webhook-var-groups">
                  {filteredGroups.length === 0 ? (
                    <p className="webhook-var-empty">Geen variabelen gevonden</p>
                  ) : (
                    filteredGroups.map((group) => {
                      const open =
                        Boolean(search.trim()) || Boolean(openGroups[group.id]);
                      return (
                        <div key={`${webhookId}-${group.id}`}>
                          <button
                            type="button"
                            className={`webhook-var-group-btn${open ? " is-open" : ""}`}
                            onClick={() => toggleGroup(group.id)}
                          >
                            <span>{group.title}</span>
                            <span className="webhook-var-group-chevron">
                              <IconChevron open={open} />
                            </span>
                          </button>
                          {open ? (
                            <div className="webhook-var-items">
                              {group.items.map((item) => (
                                <button
                                  key={`${webhookId}-${item.key}`}
                                  type="button"
                                  className="webhook-var-item"
                                  onClick={() => insertVariable(item.key)}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="webhook-data-pane">
          <span>Resultaat</span>
          <textarea
            className="code-field webhook-code-field webhook-result-field"
            rows={26}
            value={preview.ok ? preview.text : preview.error}
            readOnly
            spellCheck={false}
          />
        </div>
      </div>

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
            onChange(formatWebhookPayloadJson(cloneDefaultWebhookPayload()))
          }
        >
          Standaard JSON
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() =>
            onChange(formatWebhookPayloadJson(cloneSalesforceWebhookPayload()))
          }
        >
          Salesforce JSON
        </button>
      </div>
    </div>
  );
}
