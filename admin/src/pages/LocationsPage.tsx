import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api, uploadMedia } from "../api/client";
import type { Location } from "../api/types";
import { useAccessibleEntities } from "../auth/entityAccess";

type FormState = {
  name: string;
  imageUrl: string;
  address: string;
  googleMapsUrl: string;
  phone: string;
  email: string;
  permalink: string;
  entityId: string;
};

const emptyForm: FormState = {
  name: "",
  imageUrl: "",
  address: "",
  googleMapsUrl: "",
  phone: "",
  email: "",
  permalink: "",
  entityId: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function LocationsPage() {
  const { canChooseEntity, entities, fixedEntity } = useAccessibleEntities();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permalinkTouched, setPermalinkTouched] = useState(false);
  const [filterEntityId, setFilterEntityId] = useState("");

  const mediaEntityKey = useMemo(() => {
    const selected =
      entities.find((entity) => entity.id === form.entityId)?.slug ||
      entities.find((entity) => entity.id === filterEntityId)?.slug;
    return selected || fixedEntity?.slug || "global";
  }, [entities, form.entityId, filterEntityId, fixedEntity]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query =
          canChooseEntity && filterEntityId
            ? `?entityId=${encodeURIComponent(filterEntityId)}`
            : "";
        const data = await api<{ locations: Location[] }>(`/locations${query}`);
        if (!cancelled) setLocations(data.locations);
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
  }, [canChooseEntity, filterEntityId]);

  async function reload() {
    const query =
      canChooseEntity && filterEntityId
        ? `?entityId=${encodeURIComponent(filterEntityId)}`
        : "";
    const data = await api<{ locations: Location[] }>(`/locations${query}`);
    setLocations(data.locations);
  }

  function startCreate() {
    setEditingId(null);
    setPermalinkTouched(false);
    setForm({
      ...emptyForm,
      entityId: canChooseEntity
        ? filterEntityId || entities[0]?.id || ""
        : fixedEntity?.id || "",
    });
    setShowForm(true);
  }

  function startEdit(location: Location) {
    setEditingId(location.id);
    setPermalinkTouched(true);
    setForm({
      name: location.name,
      imageUrl: location.imageUrl || "",
      address: location.address,
      googleMapsUrl: location.googleMapsUrl,
      phone: location.phone,
      email: location.email,
      permalink: location.permalink,
      entityId: location.entityId,
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
        await api(`/locations/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            imageUrl: form.imageUrl || null,
            address: form.address,
            googleMapsUrl: form.googleMapsUrl,
            phone: form.phone,
            email: form.email,
            permalink: form.permalink,
          }),
        });
      } else {
        if (canChooseEntity && !form.entityId) {
          setError("Kies een entiteit");
          setSaving(false);
          return;
        }

        await api("/locations", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            imageUrl: form.imageUrl || null,
            address: form.address,
            googleMapsUrl: form.googleMapsUrl,
            phone: form.phone,
            email: form.email,
            permalink: form.permalink,
            ...(canChooseEntity ? { entityId: form.entityId } : {}),
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
    if (!window.confirm("Deze locatie verwijderen?")) return;
    setError(null);
    try {
      await api(`/locations/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Locaties</h1>
          <p>Locaties van jouw entiteit beheren.</p>
        </div>
        <button type="button" className="btn" onClick={startCreate}>
          Nieuwe locatie
        </button>
      </div>

      {canChooseEntity ? (
        <label style={{ marginBottom: "1rem", maxWidth: 320 }}>
          Filter op entiteit
          <select
            value={filterEntityId}
            onChange={(e) => setFilterEntityId(e.target.value)}
          >
            <option value="">Alle entiteiten</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="panel">
        {loading ? (
          <div className="empty">Laden…</div>
        ) : locations.length === 0 ? (
          <div className="empty">Nog geen locaties.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Naam</th>
                {canChooseEntity ? <th>Entiteit</th> : null}
                <th>Adres</th>
                <th>Permalink</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.id}>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      {location.imageUrl ? (
                        <img
                          src={location.imageUrl}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: "cover",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                          }}
                        />
                      ) : null}
                      <span>{location.name}</span>
                    </div>
                  </td>
                  {canChooseEntity ? <td>{location.entity?.name ?? "—"}</td> : null}
                  <td>{location.address}</td>
                  <td>
                    <span className="badge">{location.permalink}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className={
                          showForm && editingId === location.id
                            ? "btn btn-small"
                            : "btn btn-secondary btn-small"
                        }
                        disabled={
                          (showForm && editingId !== location.id) ||
                          (editingId === location.id &&
                            (saving || uploading))
                        }
                        onClick={() => {
                          if (showForm && editingId === location.id) {
                            (
                              document.getElementById(
                                "location-form",
                              ) as HTMLFormElement | null
                            )?.requestSubmit();
                            return;
                          }
                          startEdit(location);
                        }}
                      >
                        {showForm && editingId === location.id
                          ? saving
                            ? "Opslaan…"
                            : "Opslaan"
                          : "Bewerken"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => void onDelete(location.id)}
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
          <form id="location-form" className="drawer stack" onSubmit={onSubmit}>
            <h2>{editingId ? "Locatie bewerken" : "Nieuwe locatie"}</h2>

            {canChooseEntity && !editingId ? (
              <label>
                Entiteit
                <select
                  value={form.entityId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, entityId: e.target.value }))
                  }
                  required
                >
                  <option value="">Kies entiteit…</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

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
                      permalink: permalinkTouched
                        ? prev.permalink
                        : slugify(name),
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Permalink
                <input
                  value={form.permalink}
                  onChange={(e) => {
                    setPermalinkTouched(true);
                    setForm((prev) => ({
                      ...prev,
                      permalink: e.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Adres
                <input
                  value={form.address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Google Maps link
                <input
                  type="url"
                  value={form.googleMapsUrl}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      googleMapsUrl: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Telefoonnummer
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
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
              <img
                src={form.imageUrl}
                alt="Locatie"
                style={{
                  width: 120,
                  height: 80,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                }}
              />
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
