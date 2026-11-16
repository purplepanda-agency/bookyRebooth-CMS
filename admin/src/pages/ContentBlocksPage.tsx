import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import { api } from "../api/client";
import type { ContentBlock, ContentBlockButton } from "../api/types";
import { useAccessibleEntities } from "../auth/entityAccess";

type StepOption = {
  id: string;
  label: string;
  type: string;
  flowId: string;
  flowName: string;
};

type FormState = {
  title: string;
  text: string;
  buttons: ContentBlockButton[];
  active: boolean;
  stepIds: string[];
};

const emptyForm: FormState = {
  title: "",
  text: "",
  buttons: [],
  active: true,
  stepIds: [],
};

export function ContentBlocksPage() {
  const { selectedEntityId, settleEntityTransition } = useAccessibleEntities();
  const hasLoadedRef = useRef(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [stepOptions, setStepOptions] = useState<StepOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectOptions = useMemo(
    () =>
      stepOptions.map((option) => ({
        value: option.id,
        label: option.label,
      })),
    [stepOptions],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedEntityId) {
        setBlocks([]);
        setStepOptions([]);
        setLoading(false);
        settleEntityTransition();
        return;
      }

      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const query = `?entityId=${encodeURIComponent(selectedEntityId)}`;
        const [blocksData, optionsData] = await Promise.all([
          api<{ contentBlocks: ContentBlock[] }>(`/content-blocks${query}`),
          api<{ options: StepOption[] }>(
            `/content-blocks/step-options${query}`,
          ),
        ]);
        if (!cancelled) {
          setBlocks(blocksData.contentBlocks);
          setStepOptions(optionsData.options);
          hasLoadedRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          settleEntityTransition();
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedEntityId, settleEntityTransition]);

  async function reload() {
    if (!selectedEntityId) return;
    const query = `?entityId=${encodeURIComponent(selectedEntityId)}`;
    const [blocksData, optionsData] = await Promise.all([
      api<{ contentBlocks: ContentBlock[] }>(`/content-blocks${query}`),
      api<{ options: StepOption[] }>(`/content-blocks/step-options${query}`),
    ]);
    setBlocks(blocksData.contentBlocks);
    setStepOptions(optionsData.options);
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(block: ContentBlock) {
    setEditingId(block.id);
    setForm({
      title: block.title,
      text: block.text,
      buttons: block.buttons.length
        ? block.buttons.map((button) => ({ ...button }))
        : [],
      active: block.active,
      stepIds: block.steps.map((step) => step.id),
    });
    setShowForm(true);
  }

  function addButton() {
    setForm((prev) => ({
      ...prev,
      buttons: [...prev.buttons, { label: "", url: "" }],
    }));
  }

  function updateButton(
    index: number,
    field: keyof ContentBlockButton,
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.map((button, buttonIndex) =>
        buttonIndex === index ? { ...button, [field]: value } : button,
      ),
    }));
  }

  function removeButton(index: number) {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((_, buttonIndex) => buttonIndex !== index),
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedEntityId) {
      setError("Kies een entiteit");
      return;
    }

    const buttons = form.buttons
      .map((button) => ({
        label: button.label.trim(),
        url: button.url.trim(),
      }))
      .filter((button) => button.label || button.url);

    if (buttons.some((button) => !button.label || !button.url)) {
      setError("Elke knop heeft een label én URL nodig");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        text: form.text.trim(),
        buttons,
        active: form.active,
        stepIds: form.stepIds,
        entityId: selectedEntityId,
      };

      if (editingId) {
        await api(`/content-blocks/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api(`/content-blocks`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(block: ContentBlock) {
    if (!window.confirm(`Contentblok “${block.title}” verwijderen?`)) return;
    setError(null);
    try {
      await api(`/content-blocks/${block.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function toggleActive(block: ContentBlock) {
    const nextActive = !block.active;
    setError(null);
    setBlocks((prev) =>
      prev.map((item) =>
        item.id === block.id ? { ...item, active: nextActive } : item,
      ),
    );

    try {
      await api(`/content-blocks/${block.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });
    } catch (err) {
      setBlocks((prev) =>
        prev.map((item) =>
          item.id === block.id ? { ...item, active: block.active } : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Status wijzigen mislukt");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contentblokken</h1>
          <p>
            Titel, tekst en knoppen die onderaan gekozen flowstappen in de
            booking tool verschijnen.
          </p>
        </div>
        <button type="button" className="btn" onClick={startCreate}>
          Nieuw contentblok
        </button>
      </div>

      {error ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="panel">
        {loading ? (
          <div className="empty">Laden…</div>
        ) : blocks.length === 0 ? (
          <div className="empty">Nog geen contentblokken.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Titel</th>
                <th>Stappen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id}>
                  <td>
                    <label className="switch-row switch-row-compact">
                      <span className="switch">
                        <input
                          type="checkbox"
                          checked={block.active}
                          onChange={() => void toggleActive(block)}
                          aria-label={
                            block.active
                              ? "Deactiveer contentblok"
                              : "Activeer contentblok"
                          }
                        />
                        <span className="switch-slider" />
                      </span>
                    </label>
                  </td>
                  <td>
                    <strong>{block.title}</strong>
                  </td>
                  <td>
                    {block.steps.length === 0 ? (
                      <span className="muted">Geen stappen</span>
                    ) : (
                      <div className="stack" style={{ gap: "0.2rem" }}>
                        {block.steps.map((step) => (
                          <div key={step.id}>
                            {step.flow.name} · stap {step.sortOrder + 1}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => startEdit(block)}
                      >
                        Bewerken
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => void onDelete(block)}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showForm ? (
          <form
            id="content-block-form"
            className="drawer stack"
            onSubmit={onSubmit}
          >
            <h2>{editingId ? "Contentblok bewerken" : "Nieuw contentblok"}</h2>

            <label>
              Titel
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
                required
                maxLength={200}
              />
            </label>

            <label>
              Tekst
              <textarea
                value={form.text}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, text: event.target.value }))
                }
                required
                rows={5}
              />
            </label>

            <div className="stack">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <strong>Knoppen</strong>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={addButton}
                >
                  Knop toevoegen
                </button>
              </div>
              {form.buttons.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Nog geen knoppen. Optioneel: voeg één of meer knoppen toe.
                </p>
              ) : (
                form.buttons.map((button, index) => (
                  <div key={index} className="form-grid two">
                    <label>
                      Label
                      <input
                        value={button.label}
                        onChange={(event) =>
                          updateButton(index, "label", event.target.value)
                        }
                        placeholder="BMW SERVICE AFSPRAAK"
                        maxLength={120}
                      />
                    </label>
                    <label>
                      URL
                      <div className="actions" style={{ alignItems: "center" }}>
                        <input
                          value={button.url}
                          onChange={(event) =>
                            updateButton(index, "url", event.target.value)
                          }
                          placeholder="https://… of /pad"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => removeButton(index)}
                        >
                          Verwijder
                        </button>
                      </div>
                    </label>
                  </div>
                ))
              )}
            </div>

            <label>
              Gekoppelde stappen
              <Select
                isMulti
                options={selectOptions}
                value={selectOptions.filter((option) =>
                  form.stepIds.includes(option.value),
                )}
                onChange={(selected) =>
                  setForm((prev) => ({
                    ...prev,
                    stepIds: selected.map((option) => option.value),
                  }))
                }
                placeholder="Kies één of meer flowstappen…"
                classNamePrefix="rs"
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 40 }),
                }}
              />
            </label>

            <label className="switch-row">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      active: event.target.checked,
                    }))
                  }
                />
                <span className="switch-slider" />
              </span>
              <span>
                <strong>{form.active ? "Actief" : "Inactief"}</strong>
                <span className="muted" style={{ display: "block" }}>
                  Inactieve contentblokken verschijnen niet in de booking tool.
                </span>
              </span>
            </label>

            <div className="actions">
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Opslaan…" : "Opslaan"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Annuleren
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
