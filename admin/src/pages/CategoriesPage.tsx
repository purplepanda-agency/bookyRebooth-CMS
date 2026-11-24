import { Fragment, type FormEvent, useEffect, useRef, useState } from "react";
import { api, uploadMedia } from "../api/client";
import type { Category } from "../api/types";
import { useAccessibleEntities } from "../auth/entityAccess";
import { useSaveNotice } from "../components/SaveNotice";
import { IconPencil, IconTrash } from "../components/RowActionIcons";
import { useAutosaveEdit } from "../hooks/useAutosaveEdit";

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

type CategoryPatchBody = {
  name: string;
  imageUrl: string | null;
  slug: string;
};

function categoryPatchBody(form: FormState): CategoryPatchBody | null {
  if (!form.name.trim() || !form.slug.trim()) return null;
  return {
    name: form.name,
    imageUrl: form.imageUrl || null,
    slug: form.slug,
  };
}

export function CategoriesPage() {
  const { selectedEntityId, selectedEntity, settleEntityTransition } =
    useAccessibleEntities();
  const { markSaved } = useSaveNotice();
  const hasLoadedRef = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const mediaEntityKey = selectedEntity?.slug || "global";
  const tableColSpan = 3;

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

  const { flush, rememberBaseline } = useAutosaveEdit<CategoryPatchBody>({
    editingId,
    deps: form,
    buildBody: () => (editingId ? categoryPatchBody(form) : null),
    onError: setError,
    save: async (id, body) => {
      const data = await api<{ category: Category }>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setCategories((prev) =>
        prev.map((item) =>
          item.id === data.category.id ? data.category : item,
        ),
      );
    },
  });

  function openCreateForm() {
    flush();
    setEditingId(null);
    setSlugTouched(false);
    setForm({
      ...emptyForm,
      entityId: selectedEntityId,
    });
    setShowForm(true);
  }

  function openEditForm(category: Category) {
    const next: FormState = {
      name: category.name,
      imageUrl: category.imageUrl || "",
      slug: category.slug,
      entityId: category.entityId,
    };
    rememberBaseline(category.id, categoryPatchBody(next));
    setEditingId(category.id);
    setSlugTouched(true);
    setForm(next);
    setShowForm(true);
  }

  function toggleEdit(category: Category) {
    if (uploading) return;
    if (showForm && editingId === category.id) {
      flush();
      closeForm();
      return;
    }
    flush();
    openEditForm(category);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
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
    if (editingId) {
      flush();
      return;
    }

    setSavingCreate(true);
    setError(null);

    try {
      if (!selectedEntityId) {
        setError("Kies een entiteit");
        setSavingCreate(false);
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

      markSaved();
      closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSavingCreate(false);
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

  function renderCategoryFormFields(mode: "create" | "edit") {
    return (
      <>
        <h2>{mode === "edit" ? "Categorie bewerken" : "Nieuwe categorie"}</h2>

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

        {mode === "create" ? (
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeForm}
            >
              Annuleren
            </button>
            <button
              type="submit"
              className="btn"
              disabled={savingCreate || uploading}
            >
              {savingCreate ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Categorieën</h1>
          <p>Categorieën van jouw entiteit beheren.</p>
        </div>
        <button type="button" className="btn" onClick={openCreateForm}>
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
                <Fragment key={category.id}>
                  <tr
                    className={`row-clickable${showForm && editingId === category.id ? " is-open" : ""}`}
                    onClick={() => toggleEdit(category)}
                  >
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
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        <button
                          type="button"
                          className={`icon-btn${showForm && editingId === category.id ? " is-active" : ""}`}
                          aria-label="Bewerken"
                          title="Bewerken"
                          disabled={uploading}
                          onClick={() => toggleEdit(category)}
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Verwijderen"
                          title="Verwijderen"
                          onClick={() => void onDelete(category.id)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {showForm && editingId === category.id ? (
                    <tr className="table-row-expand">
                      <td colSpan={tableColSpan}>
                        <form
                          id="category-form-edit"
                          className="table-expand-panel stack"
                          onSubmit={onSubmit}
                        >
                          {renderCategoryFormFields("edit")}
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {showForm && !editingId ? (
          <form
            id="category-form-create"
            className="drawer stack"
            onSubmit={onSubmit}
          >
            {renderCategoryFormFields("create")}
          </form>
        ) : null}
      </div>
    </div>
  );
}