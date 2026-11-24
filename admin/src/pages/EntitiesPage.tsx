import { Fragment, type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import type { Entity } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { IconPencil } from "../components/RowActionIcons";
import { useSaveNotice } from "../components/SaveNotice";
import { useAutosaveEdit } from "../hooks/useAutosaveEdit";

type EntityPatchBody = {
  name: string;
  slug: string;
  active: boolean;
  maintenanceMode: boolean;
};

function entityPatchBody(form: FormState): EntityPatchBody | null {
  if (!form.name.trim() || !form.slug.trim()) return null;
  return {
    name: form.name,
    slug: form.slug,
    active: form.active,
    maintenanceMode: form.maintenanceMode,
  };
}

type FormState = {
  name: string;
  slug: string;
  active: boolean;
  maintenanceMode: boolean;
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  active: true,
  maintenanceMode: false,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function EntitiesPage() {
  const { user } = useAuth();
  const { markSaved } = useSaveNotice();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const tableColSpan = 5;

  const { flush, rememberBaseline } = useAutosaveEdit<EntityPatchBody>({
    editingId,
    deps: form,
    buildBody: () => (editingId ? entityPatchBody(form) : null),
    onError: setError,
    save: async (id, body) => {
      const data = await api<{ entity: Entity }>(`/entities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEntities((prev) =>
        prev.map((item) => (item.id === data.entity.id ? data.entity : item)),
      );
    },
  });

  useEffect(() => {
    if (!isSuper) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api<{ entities: Entity[] }>("/entities");
        if (!cancelled) {
          setEntities(data.entities);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isSuper]);

  if (!isSuper) {
    return <Navigate to="/" replace />;
  }

  function openCreateForm() {
    flush();
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setShowForm(true);
  }

  function openEditForm(entity: Entity) {
    const next: FormState = {
      name: entity.name,
      slug: entity.slug,
      active: entity.active,
      maintenanceMode: Boolean(entity.maintenanceMode),
    };
    rememberBaseline(entity.id, entityPatchBody(next));
    setEditingId(entity.id);
    setForm(next);
    setSlugTouched(true);
    setShowForm(true);
  }

  function toggleEdit(entity: Entity) {
    if (showForm && editingId === entity.id) {
      flush();
      closeForm();
      return;
    }
    flush();
    openEditForm(entity);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ entities: Entity[] }>("/entities");
      setEntities(data.entities);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden mislukt");
    } finally {
      setLoading(false);
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
      await api("/entities", {
        method: "POST",
        body: JSON.stringify(form),
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

  function renderEntityFormFields(mode: "create" | "edit") {
    return (
      <>
        <h2>{mode === "edit" ? "Entiteit bewerken" : "Nieuwe entiteit"}</h2>
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
        <label className="switch-row">
          <span className="switch">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, active: e.target.checked }))
              }
            />
            <span className="switch-slider" />
          </span>
          <span>
            <strong>{form.active ? "Actief" : "Inactief"}</strong>
          </span>
        </label>
        <label className="switch-row">
          <span className="switch">
            <input
              type="checkbox"
              checked={form.maintenanceMode}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  maintenanceMode: e.target.checked,
                }))
              }
            />
            <span className="switch-slider" />
          </span>
          <span>
            <strong>
              {form.maintenanceMode
                ? "Onderhoud / coming soon aan"
                : "Onderhoud / coming soon uit"}
            </strong>
            <span className="muted" style={{ display: "block" }}>
              Bezoekers zien een coming soon-pagina i.p.v. de booking flows.
            </span>
          </span>
        </label>
        {mode === "create" ? (
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeForm}
            >
              Annuleren
            </button>
            <button type="submit" className="btn" disabled={savingCreate}>
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
          <h1>Entiteiten</h1>
          <p>Beheer dealers / organisaties en hun status.</p>
        </div>
        <button type="button" className="btn" onClick={openCreateForm}>
          Nieuwe entiteit
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
        ) : entities.length === 0 ? (
          <div className="empty">Nog geen entiteiten.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Gebruikers</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <Fragment key={entity.id}>
                  <tr
                    className={`row-clickable${showForm && editingId === entity.id ? " is-open" : ""}`}
                    onClick={() => toggleEdit(entity)}
                  >
                    <td>{entity.name}</td>
                    <td>
                      <span className="badge">{entity.slug}</span>
                    </td>
                    <td>
                      <span className={`badge ${entity.active ? "ok" : "off"}`}>
                        {entity.active ? "Actief" : "Inactief"}
                      </span>
                      {entity.maintenanceMode ? (
                        <span
                          className="badge off"
                          style={{ marginLeft: "0.35rem" }}
                        >
                          Coming soon
                        </span>
                      ) : null}
                    </td>
                    <td>{entity._count?.users ?? 0}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        <button
                          type="button"
                          className={`icon-btn${showForm && editingId === entity.id ? " is-active" : ""}`}
                          aria-label="Bewerken"
                          title="Bewerken"
                          onClick={() => toggleEdit(entity)}
                        >
                          <IconPencil />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {showForm && editingId === entity.id ? (
                    <tr className="table-row-expand">
                      <td colSpan={tableColSpan}>
                        <form
                          id="entity-form-edit"
                          className="table-expand-panel stack"
                          onSubmit={onSubmit}
                        >
                          {renderEntityFormFields("edit")}
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
            id="entity-form-create"
            className="drawer stack"
            onSubmit={onSubmit}
          >
            {renderEntityFormFields("create")}
          </form>
        ) : null}
      </div>
    </div>
  );
}
