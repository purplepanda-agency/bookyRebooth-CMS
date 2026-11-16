import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, uploadMedia } from "../api/client";
import type { Category } from "../api/types";
import { useAccessibleEntities } from "../auth/entityAccess";

type FormState = {
  name: string;
  imageUrl: string;
  slug: string;
  entityId: string;
};

const emptyForm: FormState = {
  name: "",
  imageUrl: "",
  slug: "",
  entityId: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CategoriesPage() {
  const { selectedEntityId, selectedEntity, settleEntityTransition } =
    useAccessibleEntities();
  const hasLoadedRef = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const mediaEntityKey = selectedEntity?.slug || "global";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const query =
          selectedEntityId
            ? `?entityId=${encodeURIComponent(selectedEntityId)}`
            : "";
        const data = await api<{ categories: Category[] }>(
          `/categories${query}`,
        );
        if (!cancelled) {
          setCategories(data.categories);
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
    const query =
      selectedEntityId
        ? `?entityId=${encodeURIComponent(selectedEntityId)}`
        : "";
    const data = await api<{ categories: Category[] }>(`/categories${query}`);
    setCategories(data.categories);
  }

  function startCreate() {
    setEditingId(null);
    setSlugTouched(false);
    setForm({
      ...emptyForm,
      entityId: selectedEntityId,
    });
    setShowForm(true);
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setSlugTouched(true);
    setForm({
      name: category.name,
      imageUrl: category.imageUrl || "",
      slug: category.slug,
      entityId: category.entityId,
    });
    setShowForm(true);
  }

  async function onImageChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadMedia(file, mediaEntityKey);
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await api(`/categories/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            imageUrl: form.imageUrl || null,
            slug: form.slug,
          }),
        });
      } else {
        if (!selectedEntityId) {
          setError("Kies een entiteit");
          setSaving(false);
          return;
        }

        await api("/categories", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            imageUrl: form.imageUrl || null,
            slug: form.slug,
            entityId: selectedEntityId,
          }),
        });
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Deze categorie verwijderen?")) return;
    setError(null);
    try {
      await api(`/categories/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Categorieën</h1>
          <p>Categorieën van jouw entiteit beheren.</p>
        </div>
        <button type="button" className="btn" onClick={startCreate}>
          Nieuwe categorie
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
        ) : categories.length === 0 ? (
          <div className="empty">Nog geen categorieën.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Slug</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      {category.imageUrl ? (
                        <img
                          src={category.imageUrl}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: "cover",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                          }}
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                            background: "var(--surface-2, #f3f3f3)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span>{category.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{category.slug}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className={
                          showForm && editingId === category.id
                            ? "btn btn-small"
                            : "btn btn-secondary btn-small"
                        }
                        disabled={
                          (showForm && editingId !== category.id) ||
                          (editingId === category.id &&
                            (saving || uploading))
                        }
                        onClick={() => {
                          if (showForm && editingId === category.id) {
                            (
                              document.getElementById(
                                "category-form",
                              ) as HTMLFormElement | null
                            )?.requestSubmit();
                            return;
                          }
                          startEdit(category);
                        }}
                      >
                        {showForm && editingId === category.id
                          ? saving
                            ? "Opslaan…"
                            : "Opslaan"
                          : "Bewerken"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => void onDelete(category.id)}
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
          <form id="category-form" className="drawer stack" onSubmit={onSubmit}>
            <h2>{editingId ? "Categorie bewerken" : "Nieuwe categorie"}</h2>

            <div className="form-grid two">
              <label>
                Naam
                <input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      name,
                      slug: slugTouched ? prev.slug : slugify(name),
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((prev) => ({ ...prev, slug: e.target.value }));
                  }}
                  required
                />
              </label>
            </div>

            <label>
              Afbeelding (optioneel)
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  void onImageChange(e.target.files?.[0] ?? null)
                }
              />
            </label>
            {uploading ? <p className="muted">Afbeelding uploaden…</p> : null}
            {form.imageUrl ? (
              <div className="stack">
                <img
                  src={form.imageUrl}
                  alt="Categorie"
                  style={{
                    width: 120,
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                  }}
                />
                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, imageUrl: "" }))
                    }
                  >
                    Afbeelding verwijderen
                  </button>
                </div>
              </div>
            ) : null}

            <div className="actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="btn"
                disabled={saving || uploading}
              >
                {saving ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
