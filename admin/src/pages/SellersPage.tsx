import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import { api, uploadMedia } from "../api/client";
import type {
  Category,
  Location,
  Seller,
  SellerSchedule,
  Weekday,
} from "../api/types";
import { useAccessibleEntities } from "../auth/entityAccess";
import { useSaveNotice } from "../components/SaveNotice";

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

type DraftSchedule = {
  key: string;
  weekday: Weekday | "";
  startTime: string;
  endTime: string;
  locationId: string;
};

type SelectOption = { value: string; label: string };

type SellerSortKey = "primaryLocation" | "categories";
type SortDirection = "asc" | "desc";

type FormState = {
  name: string;
  email: string;
  imageUrl: string;
  active: boolean;
  entityId: string;
  primaryLocationId: string;
  categoryIds: string[];
  schedules: DraftSchedule[];
};

const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: "MONDAY", label: "Maandag" },
  { value: "TUESDAY", label: "Dinsdag" },
  { value: "WEDNESDAY", label: "Woensdag" },
  { value: "THURSDAY", label: "Donderdag" },
  { value: "FRIDAY", label: "Vrijdag" },
  { value: "SATURDAY", label: "Zaterdag" },
  { value: "SUNDAY", label: "Zondag" },
];

function newSchedule(
  weekday: Weekday | "" = "",
  locationId = "",
): DraftSchedule {
  return {
    key: crypto.randomUUID(),
    weekday,
    startTime: "09:00",
    endTime: "17:00",
    locationId,
  };
}

const emptyForm: FormState = {
  name: "",
  email: "",
  imageUrl: "",
  active: true,
  entityId: "",
  primaryLocationId: "",
  categoryIds: [],
  schedules: [],
};

export function SellersPage() {
  const { selectedEntityId, selectedEntity, settleEntityTransition } =
    useAccessibleEntities();
  const { markSaved } = useSaveNotice();
  const hasLoadedRef = useRef(false);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sortKey, setSortKey] = useState<SellerSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const mediaEntityKey = selectedEntity?.slug || "global";

  const availableWeekdays = useMemo(() => {
    const used = new Set(
      form.schedules
        .map((item) => item.weekday)
        .filter((day): day is Weekday => Boolean(day)),
    );
    return WEEKDAYS.filter((day) => !used.has(day.value));
  }, [form.schedules]);

  const categoryOptions = useMemo<SelectOption[]>(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories],
  );

  const sortedSellers = useMemo(() => {
    if (!sortKey) return sellers;

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...sellers].sort((a, b) => {
      const valueA =
        sortKey === "primaryLocation"
          ? (a.primaryLocation?.name || "").toLocaleLowerCase("nl")
          : (a.categories ?? [])
              .map((category) => category.name)
              .join(", ")
              .toLocaleLowerCase("nl");
      const valueB =
        sortKey === "primaryLocation"
          ? (b.primaryLocation?.name || "").toLocaleLowerCase("nl")
          : (b.categories ?? [])
              .map((category) => category.name)
              .join(", ")
              .toLocaleLowerCase("nl");

      if (!valueA && valueB) return 1;
      if (valueA && !valueB) return -1;
      return valueA.localeCompare(valueB, "nl") * direction;
    });
  }, [sellers, sortKey, sortDirection]);

  const activeSellers = useMemo(
    () => sortedSellers.filter((seller) => seller.active),
    [sortedSellers],
  );

  const inactiveSellers = useMemo(
    () => sortedSellers.filter((seller) => !seller.active),
    [sortedSellers],
  );

  function toggleSort(key: SellerSortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function sortIndicator(key: SellerSortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const entityQuery = selectedEntityId
          ? `?entityId=${encodeURIComponent(selectedEntityId)}`
          : "";

        const [sellersData, locationsData, categoriesData] = await Promise.all([
          api<{ sellers: Seller[] }>(`/sellers${entityQuery}`),
          api<{ locations: Location[] }>(`/locations${entityQuery}`),
          api<{ categories: Category[] }>(`/categories${entityQuery}`),
        ]);

        if (!cancelled) {
          setSellers(sellersData.sellers);
          setLocations(locationsData.locations);
          setCategories(categoriesData.categories);
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
    const entityQuery = selectedEntityId
      ? `?entityId=${encodeURIComponent(selectedEntityId)}`
      : "";
    const [sellersData, locationsData, categoriesData] = await Promise.all([
      api<{ sellers: Seller[] }>(`/sellers${entityQuery}`),
      api<{ locations: Location[] }>(`/locations${entityQuery}`),
      api<{ categories: Category[] }>(`/categories${entityQuery}`),
    ]);
    setSellers(sellersData.sellers);
    setLocations(locationsData.locations);
    setCategories(categoriesData.categories);
  }

  async function loadEntityScopedData(entityId: string) {
    if (!entityId) {
      setLocations([]);
      setCategories([]);
      return;
    }
    const query = `?entityId=${encodeURIComponent(entityId)}`;
    const [locationsData, categoriesData] = await Promise.all([
      api<{ locations: Location[] }>(`/locations${query}`),
      api<{ categories: Category[] }>(`/categories${query}`),
    ]);
    setLocations(locationsData.locations);
    setCategories(categoriesData.categories);
  }

  function startCreate() {
    const entityId = selectedEntityId;
    setEditingId(null);
    setForm({
      ...emptyForm,
      entityId,
      primaryLocationId: "",
      categoryIds: [],
      schedules: [],
    });
    setShowForm(true);
    if (entityId) void loadEntityScopedData(entityId);
  }

  function startEdit(seller: Seller) {
    setEditingId(seller.id);
    setForm({
      name: seller.name,
      email: seller.email,
      imageUrl: seller.imageUrl,
      active: seller.active,
      entityId: seller.entityId,
      primaryLocationId:
        seller.primaryLocationId || seller.primaryLocation?.id || "",
      categoryIds: (seller.categories ?? []).map((category) => category.id),
      schedules: seller.schedules.map((item: SellerSchedule) => ({
        key: item.id ?? crypto.randomUUID(),
        weekday: item.weekday,
        startTime: item.startTime,
        endTime: item.endTime,
        locationId: item.locationId,
      })),
    });
    setShowForm(true);
    void loadEntityScopedData(seller.entityId);
  }

  function addScheduleDay() {
    const nextDay = availableWeekdays[0]?.value;
    if (!nextDay) {
      setError("Alle weekdagen zijn al toegevoegd");
      return;
    }
    setError(null);
    setForm((prev) => ({
      ...prev,
      schedules: [
        ...prev.schedules,
        newSchedule(nextDay, prev.primaryLocationId),
      ],
    }));
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

    if (!form.imageUrl) {
      setError("Afbeelding is verplicht");
      return;
    }

    if (!form.primaryLocationId) {
      setError("Hoofdlocatie is verplicht");
      return;
    }

    for (const item of form.schedules) {
      if (!item.weekday || !item.locationId) {
        setError("Elke werkdag heeft een weekdag en locatie nodig");
        return;
      }
      if (item.startTime >= item.endTime) {
        setError("Eindtijd moet na starttijd liggen");
        return;
      }
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      email: form.email,
      imageUrl: form.imageUrl,
      active: form.active,
      primaryLocationId: form.primaryLocationId,
      categoryIds: form.categoryIds,
      schedules: form.schedules.map((item) => ({
        weekday: item.weekday as Weekday,
        startTime: item.startTime,
        endTime: item.endTime,
        locationId: item.locationId,
      })),
      ...(!editingId ? { entityId: selectedEntityId } : {}),
    };

    try {
      if (editingId) {
        await api(`/sellers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        if (!selectedEntityId) {
          setError("Kies een entiteit");
          setSaving(false);
          return;
        }
        await api("/sellers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      markSaved();
      closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Deze verkoper verwijderen?")) return;
    setError(null);
    try {
      await api(`/sellers/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function toggleActive(seller: Seller) {
    const nextActive = !seller.active;
    setError(null);

    // Optimistic UI update
    setSellers((prev) =>
      prev.map((item) =>
        item.id === seller.id ? { ...item, active: nextActive } : item,
      ),
    );

    try {
      await api(`/sellers/${seller.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: seller.name,
          email: seller.email,
          imageUrl: seller.imageUrl,
          active: nextActive,
          primaryLocationId:
            seller.primaryLocationId ||
            seller.primaryLocation?.id ||
            seller.schedules[0]?.locationId,
          categoryIds: (seller.categories ?? []).map((category) => category.id),
          schedules: seller.schedules.map((item) => ({
            weekday: item.weekday,
            startTime: item.startTime,
            endTime: item.endTime,
            locationId: item.locationId,
          })),
        }),
      });
    } catch (err) {
      setSellers((prev) =>
        prev.map((item) =>
          item.id === seller.id ? { ...item, active: seller.active } : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Status wijzigen mislukt");
    }
  }

  function weekdayLabel(value: Weekday) {
    return WEEKDAYS.find((day) => day.value === value)?.label ?? value;
  }

  function optionsForSchedule(current: DraftSchedule) {
    const used = new Set(
      form.schedules
        .filter((item) => item.key !== current.key && item.weekday)
        .map((item) => item.weekday),
    );
    return WEEKDAYS.filter(
      (day) => !used.has(day.value) || day.value === current.weekday,
    );
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  const tableColSpan = 6;

  function renderSellerFormFields(mode: "create" | "edit") {
    return (
      <>
        <h2>{mode === "edit" ? "Verkoper bewerken" : "Nieuwe verkoper"}</h2>

        <div className="form-grid two">
          <label>
            Naam
            <input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
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
          <label>
            Hoofdlocatie
            <select
              value={form.primaryLocationId}
              onChange={(e) => {
                const primaryLocationId = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  primaryLocationId,
                  schedules: prev.schedules.map((item) =>
                    item.locationId
                      ? item
                      : { ...item, locationId: primaryLocationId },
                  ),
                }));
              }}
              required
            >
              <option value="">Kies hoofdlocatie…</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Afbeelding
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                void onImageChange(e.target.files?.[0] ?? null)
              }
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
            <span className="muted" style={{ display: "block" }}>
              Inactieve verkopers zijn tijdelijk niet zichtbaar in de
              toepassing.
            </span>
          </span>
        </label>

        <label>
          Categorieën
          <Select
            isMulti
            classNamePrefix="rs"
            options={categoryOptions}
            value={categoryOptions.filter((option) =>
              form.categoryIds.includes(option.value),
            )}
            onChange={(selected) =>
              setForm((prev) => ({
                ...prev,
                categoryIds: selected.map((option) => option.value),
              }))
            }
            placeholder="Selecteer categorieën…"
            noOptionsMessage={() => "Geen categorieën"}
          />
        </label>

        {uploading ? <p className="muted">Afbeelding uploaden…</p> : null}
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt={form.name || "Verkoper"}
            style={{
              width: 96,
              height: 96,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid var(--line)",
            }}
          />
        ) : null}

        <div className="stack">
          <h3>Werkschema</h3>
          <p className="muted">
            Elke weekdag kan maar één keer. Kies per dag start, einde en
            locatie.
          </p>

          {locations.length === 0 ? (
            <p className="error">
              Maak eerst minstens één locatie aan voor deze entiteit.
            </p>
          ) : null}

          {form.schedules.map((item) => (
            <div key={item.key} className="repeater-item">
              <div className="panel-body stack">
                <div className="form-grid two">
                  <label>
                    Weekdag
                    <select
                      value={item.weekday}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          schedules: prev.schedules.map((schedule) =>
                            schedule.key === item.key
                              ? {
                                  ...schedule,
                                  weekday: e.target.value as Weekday,
                                }
                              : schedule,
                          ),
                        }))
                      }
                      required
                    >
                      <option value="">Kies dag…</option>
                      {optionsForSchedule(item).map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Locatie
                    <select
                      value={item.locationId}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          schedules: prev.schedules.map((schedule) =>
                            schedule.key === item.key
                              ? {
                                  ...schedule,
                                  locationId: e.target.value,
                                }
                              : schedule,
                          ),
                        }))
                      }
                      required
                    >
                      <option value="">Kies locatie…</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Starttijd
                    <input
                      type="time"
                      value={item.startTime}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          schedules: prev.schedules.map((schedule) =>
                            schedule.key === item.key
                              ? {
                                  ...schedule,
                                  startTime: e.target.value,
                                }
                              : schedule,
                          ),
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Eindtijd
                    <input
                      type="time"
                      value={item.endTime}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          schedules: prev.schedules.map((schedule) =>
                            schedule.key === item.key
                              ? { ...schedule, endTime: e.target.value }
                              : schedule,
                          ),
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        schedules: prev.schedules.filter(
                          (schedule) => schedule.key !== item.key,
                        ),
                      }))
                    }
                  >
                    Dag verwijderen
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="repeater-add">
            <button
              type="button"
              className="add-product-btn"
              onClick={addScheduleDay}
              disabled={availableWeekdays.length === 0}
            >
              <span className="add-product-circle">+</span>
              <span>Voeg werkdag toe</span>
            </button>
          </div>
        </div>

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
            disabled={saving || uploading}
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Verkopers</h1>
          <p>Verkopers en werkschema’s van jouw entiteit.</p>
        </div>
        <button type="button" className="btn" onClick={startCreate}>
          Nieuwe verkoper
        </button>
      </div>

      {error ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="panel">
          <div className="empty">Laden…</div>
        </div>
      ) : (
        <>
          <div className="panel">
            {activeSellers.length === 0 && !(showForm && !editingId) ? (
              <div className="empty">Nog geen actieve verkopers.</div>
            ) : activeSellers.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Verkoper</th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-btn"
                        onClick={() => toggleSort("primaryLocation")}
                      >
                        Hoofdlocatie{sortIndicator("primaryLocation")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-btn"
                        onClick={() => toggleSort("categories")}
                      >
                        Categorieën{sortIndicator("categories")}
                      </button>
                    </th>
                    <th>Werkdagen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeSellers.map((seller) => (
                    <Fragment key={seller.id}>
                      <tr>
                        <td>
                          <label className="switch-row switch-row-compact">
                            <span className="switch">
                              <input
                                type="checkbox"
                                checked={seller.active}
                                onChange={() => void toggleActive(seller)}
                                aria-label="Deactiveer verkoper"
                              />
                              <span className="switch-slider" />
                            </span>
                          </label>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                            }}
                          >
                            <img
                              src={seller.imageUrl}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: "cover",
                                borderRadius: 6,
                                border: "1px solid var(--line)",
                              }}
                            />
                            <span>{seller.name}</span>
                          </div>
                        </td>
                        <td>{seller.primaryLocation?.name ?? "—"}</td>
                        <td>
                          {(seller.categories ?? []).length === 0
                            ? "—"
                            : (seller.categories ?? [])
                                .map((category) => category.name)
                                .join(", ")}
                        </td>
                        <td>
                          {seller.schedules.length === 0
                            ? "—"
                            : seller.schedules
                                .map((item) => weekdayLabel(item.weekday))
                                .join(", ")}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className={
                                showForm && editingId === seller.id
                                  ? "btn btn-small"
                                  : "btn btn-secondary btn-small"
                              }
                              disabled={
                                (showForm &&
                                  Boolean(editingId) &&
                                  editingId !== seller.id) ||
                                (editingId === seller.id &&
                                  (saving || uploading))
                              }
                              onClick={() => {
                                if (showForm && editingId === seller.id) {
                                  (
                                    document.getElementById(
                                      "seller-form-edit",
                                    ) as HTMLFormElement | null
                                  )?.requestSubmit();
                                  return;
                                }
                                startEdit(seller);
                              }}
                            >
                              {showForm && editingId === seller.id
                                ? saving
                                  ? "Opslaan…"
                                  : "Opslaan"
                                : "Bewerken"}
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label="Verwijderen"
                              title="Verwijderen"
                              onClick={() => void onDelete(seller.id)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {showForm && editingId === seller.id ? (
                        <tr className="table-row-expand">
                          <td colSpan={tableColSpan}>
                            <form
                              id="seller-form-edit"
                              className="table-expand-panel stack"
                              onSubmit={onSubmit}
                            >
                              {renderSellerFormFields("edit")}
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : null}

            {showForm && !editingId ? (
              <form
                id="seller-form-create"
                className="drawer stack"
                onSubmit={onSubmit}
              >
                {renderSellerFormFields("create")}
              </form>
            ) : null}
          </div>

          {inactiveSellers.length > 0 ? (
            <div className="panel" style={{ marginTop: "1.25rem" }}>
              <div className="panel-body" style={{ paddingBottom: 0 }}>
                <h2 style={{ marginBottom: "0.35rem" }}>
                  Inactieve verkopers
                </h2>
                <p className="muted" style={{ marginBottom: "1rem" }}>
                  Deze verkopers zijn tijdelijk niet zichtbaar in de
                  toepassing.
                </p>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Verkoper</th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-btn"
                        onClick={() => toggleSort("primaryLocation")}
                      >
                        Hoofdlocatie{sortIndicator("primaryLocation")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-btn"
                        onClick={() => toggleSort("categories")}
                      >
                        Categorieën{sortIndicator("categories")}
                      </button>
                    </th>
                    <th>Werkdagen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveSellers.map((seller) => (
                    <Fragment key={seller.id}>
                      <tr>
                        <td>
                          <label className="switch-row switch-row-compact">
                            <span className="switch">
                              <input
                                type="checkbox"
                                checked={seller.active}
                                onChange={() => void toggleActive(seller)}
                                aria-label="Activeer verkoper"
                              />
                              <span className="switch-slider" />
                            </span>
                          </label>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                            }}
                          >
                            <img
                              src={seller.imageUrl}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: "cover",
                                borderRadius: 6,
                                border: "1px solid var(--line)",
                                opacity: 0.7,
                              }}
                            />
                            <span>{seller.name}</span>
                          </div>
                        </td>
                        <td>{seller.primaryLocation?.name ?? "—"}</td>
                        <td>
                          {(seller.categories ?? []).length === 0
                            ? "—"
                            : (seller.categories ?? [])
                                .map((category) => category.name)
                                .join(", ")}
                        </td>
                        <td>
                          {seller.schedules.length === 0
                            ? "—"
                            : seller.schedules
                                .map((item) => weekdayLabel(item.weekday))
                                .join(", ")}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className={
                                showForm && editingId === seller.id
                                  ? "btn btn-small"
                                  : "btn btn-secondary btn-small"
                              }
                              disabled={
                                (showForm &&
                                  Boolean(editingId) &&
                                  editingId !== seller.id) ||
                                (editingId === seller.id &&
                                  (saving || uploading))
                              }
                              onClick={() => {
                                if (showForm && editingId === seller.id) {
                                  (
                                    document.getElementById(
                                      "seller-form-edit",
                                    ) as HTMLFormElement | null
                                  )?.requestSubmit();
                                  return;
                                }
                                startEdit(seller);
                              }}
                            >
                              {showForm && editingId === seller.id
                                ? saving
                                  ? "Opslaan…"
                                  : "Opslaan"
                                : "Bewerken"}
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label="Verwijderen"
                              title="Verwijderen"
                              onClick={() => void onDelete(seller.id)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {showForm && editingId === seller.id ? (
                        <tr className="table-row-expand">
                          <td colSpan={tableColSpan}>
                            <form
                              id="seller-form-edit"
                              className="table-expand-panel stack"
                              onSubmit={onSubmit}
                            >
                              {renderSellerFormFields("edit")}
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
