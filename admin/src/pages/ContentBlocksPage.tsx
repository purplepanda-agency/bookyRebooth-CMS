import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import { api } from "../api/client";
import type { ContentBlock } from "../api/types";
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
  buttonLabel: string;
  buttonUrl: string;
  active: boolean;
  stepIds: string[];
};

const emptyForm: FormState = {
  title: "",
  text: "",
  buttonLabel: "",
  buttonUrl: "",
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
      buttonLabel: block.buttonLabel || "",
      buttonUrl: block.buttonUrl || "",
      active: block.active,
      stepIds: block.steps.map((step) => step.id),
    });
    setShowForm(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedEntityId) {
      setError("Kies een entiteit");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        text: form.text.trim(),
        buttonLabel: form.buttonLabel.trim() || null,
        buttonUrl: form.buttonUrl.trim() || null,
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contentblokken</h1>
          <p>
            Titel, tekst en knop die op gekozen flowstappen in de booking tool
            verschijnen.
          </p>
        </div>
        <button type="button" className="btn" onClick={startCreate}>
          Nieuw contentblok
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {showForm ? (
        <form className="panel" onSubmit={onSubmit} style={{ marginBottom: "1.5rem" }}>
          <div className="panel-body stack">
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

            <div className="form-grid">
              <label>
                Knoplabel
                <input
                  value={form.buttonLabel}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      buttonLabel: event.target.value,
                    }))
                  }
                  placeholder="Optioneel"
                  maxLength={120}
                />
              </label>
              <label>
                Knop-URL
                <input
                  value={form.buttonUrl}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      buttonUrl: event.target.value,
                    }))
                  }
                  placeholder="https://… of /pad"
                />
              </label>
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
              />
            </label>

            <label className="checkbox-row">
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
              Actief
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
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="empty">Laden…</div>
      ) : blocks.length === 0 ? (
        <div className="empty">Nog geen contentblokken.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Stappen</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <tr key={block.id}>
                <td>
                  <strong>{block.title}</strong>
                  {block.buttonLabel ? (
                    <div className="muted" style={{ marginTop: "0.25rem" }}>
                      Knop: {block.buttonLabel}
                    </div>
                  ) : null}
                </td>
                <td>
                  {block.steps.length === 0 ? (
                    <span className="muted">Geen stappen</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                      {block.steps.map((step) => (
                        <li key={step.id}>
                          {step.flow.name} · stap {step.sortOrder + 1}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>{block.active ? "Actief" : "Inactief"}</td>
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
                      className="btn btn-ghost btn-small"
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
    </div>
  );
}
