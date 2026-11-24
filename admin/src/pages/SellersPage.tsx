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
import {
  MAX_EXCEPTION_DATES,
  MAX_REPEAT_EVERY,
  expandExceptionDates,
  includedExceptionDates,
  type ExceptionKind,
  type ExceptionRepeatUnit,
} from "../../../src/lib/scheduleExceptions";
import { useAccessibleEntities } from "../auth/entityAccess";
import { IconPencil, IconTrash } from "../components/RowActionIcons";
import { useSaveNotice } from "../components/SaveNotice";

type DraftSchedule = {
  key: string;
  weekday: Weekday | "";
  startTime: string;
  endTime: string;
  locationId: string;
};

type DraftException = {
  key: string;
  kind: ExceptionKind;
  startDate: string;
  endDate: string;
  repeatEvery: number;
  repeatUnit: ExceptionRepeatUnit;
  excludedDates: string[];
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
  exceptions: DraftException[];
};

const WEEKDAYS: Array<{ value: Weekday; label: string; short: string }> = [
  { value: "MONDAY", label: "Maandag", short: "Ma" },
  { value: "TUESDAY", label: "Dinsdag", short: "Di" },
  { value: "WEDNESDAY", label: "Woensdag", short: "Wo" },
  { value: "THURSDAY", label: "Donderdag", short: "Do" },
  { value: "FRIDAY", label: "Vrijdag", short: "Vr" },
  { value: "SATURDAY", label: "Zaterdag", short: "Za" },
  { value: "SUNDAY", label: "Zondag", short: "Zo" },
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

function newException(locationId = ""): DraftException {
  return {
    key: crypto.randomUUID(),
    kind: "OFF",
    startDate: "",
    endDate: "",
    repeatEvery: 1,
    repeatUnit: "DAY",
    excludedDates: [],
    startTime: "09:00",
    endTime: "17:00",
    locationId,
  };
}

function formatChipDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, (month ?? 1) - 1, day)));
}

function exceptionRule(item: DraftException) {
  return {
    startDate: item.startDate,
    endDate: item.endDate,
    repeatEvery: item.repeatEvery,
    repeatUnit: item.repeatUnit,
  };
}

function patchExceptions(
  exceptions: DraftException[],
  key: string,
  patch: Partial<DraftException>,
) {
  return exceptions.map((item) =>
    item.key === key ? { ...item, ...patch } : item,
  );
}

function exceptionPayload(items: DraftException[]) {
  return items.map((item) => {
    const generated = new Set(expandExceptionDates(exceptionRule(item)));
    const working = item.kind === "WORKING";
    return {
      kind: item.kind,
      startDate: item.startDate,
      endDate: item.endDate,
      repeatEvery: item.repeatEvery,
      repeatUnit: item.repeatUnit,
      excludedDates: item.excludedDates.filter((date) => generated.has(date)),
      startTime: working ? item.startTime : null,
      endTime: working ? item.endTime : null,
      locationId: working ? item.locationId : null,
    };
  });
}

function draftExceptions(seller: Seller): DraftException[] {
  return (seller.exceptions ?? []).map((item) => ({
    key: item.id ?? crypto.randomUUID(),
    kind: item.kind,
    startDate: item.startDate,
    endDate: item.endDate,
    repeatEvery: item.repeatEvery || 1,
    repeatUnit: item.repeatUnit || "DAY",
    excludedDates: Array.isArray(item.excludedDates) ? item.excludedDates : [],
    startTime: item.startTime || "09:00",
    endTime: item.endTime || "17:00",
    locationId: item.locationId || seller.primaryLocationId || "",
  }));
}

type SellerWritePayload = {
  name: string;
  email: string;
  imageUrl: string;
  active: boolean;
  primaryLocationId: string;
  categoryIds: string[];
  schedules: Array<{
    weekday: Weekday;
    startTime: string;
    endTime: string;
    locationId: string;
  }>;
  exceptions: ReturnType<typeof exceptionPayload>;
};

function buildAutoPayload(
  form: FormState,
  persistedExceptionKeys: Set<string>,
): { body: SellerWritePayload; exceptionKeys: string[] } | null {
  const name = form.name.trim();
  if (!name || name.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return null;
  if (!form.imageUrl || !form.primaryLocationId) return null;

  const weekdays = new Set<string>();
  for (const item of form.schedules) {
    if (!item.weekday || !item.locationId) return null;
    if (item.startTime >= item.endTime) return null;
    if (weekdays.has(item.weekday)) return null;
    weekdays.add(item.weekday);
  }

  const exceptions: DraftException[] = [];
  for (const item of form.exceptions) {
    const emptyDates = !item.startDate && !item.endDate;
    if (emptyDates && !persistedExceptionKeys.has(item.key)) continue;
    if (validateExceptions([item])) return null;
    exceptions.push(item);
  }

  return {
    exceptionKeys: exceptions.map((item) => item.key),
    body: {
      name,
      email: form.email.trim(),
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
      exceptions: exceptionPayload(exceptions),
    },
  };
}

function validateExceptions(items: DraftException[]) {
  for (const item of items) {
    if (!item.startDate || !item.endDate) {
      return "Elke uitzondering heeft een begin- en einddatum nodig";
    }
    if (item.startDate > item.endDate) {
      return "Einddatum moet op of na de begindatum liggen";
    }
    const generated = expandExceptionDates(exceptionRule(item));
    if (generated.length > MAX_EXCEPTION_DATES) {
      return `Een uitzondering mag maximaal ${MAX_EXCEPTION_DATES} dagen bevatten`;
    }
    if (
      includedExceptionDates({
        ...exceptionRule(item),
        excludedDates: item.excludedDates,
      }).length === 0
    ) {
      return "Een uitzondering moet minstens één datum bevatten";
    }
    if (item.kind === "WORKING") {
      if (!item.locationId) {
        return "Een werkuitzondering heeft een locatie nodig";
      }
      if (item.startTime >= item.endTime) {
        return "Eindtijd moet na starttijd liggen";
      }
    }
  }
  return null;
}

const emptyForm: FormState = {
  name: "",
  email: "",
  imageUrl: "",
  active: false,
  entityId: "",
  primaryLocationId: "",
  categoryIds: [],
  schedules: [],
  exceptions: [],
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedPayloadByIdRef = useRef(new Map<string, string>());
  const persistedExceptionKeysRef = useRef(new Set<string>());
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{
    sellerId: string;
    snapshot: string;
    exceptionKeys: string[];
  } | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const editingIdRef = useRef<string | null>(null);
  const formRef = useRef(form);
  editingIdRef.current = editingId;
  formRef.current = form;

  function enqueueSave(
    sellerId: string,
    snapshot: string,
    exceptionKeys: string[],
  ) {
    saveChainRef.current = saveChainRef.current
      .then(async () => {
        if (savedPayloadByIdRef.current.get(sellerId) === snapshot) return;
        setSaving(true);
        try {
          const data = await api<{ seller: Seller }>(`/sellers/${sellerId}`, {
            method: "PUT",
            body: snapshot,
          });
          savedPayloadByIdRef.current.set(sellerId, snapshot);
          if (editingIdRef.current === sellerId) {
            for (const key of exceptionKeys) {
              persistedExceptionKeysRef.current.add(key);
            }
          }
          setSellers((prev) =>
            prev.map((item) => (item.id === data.seller.id ? data.seller : item)),
          );
          setError(null);
          markSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Opslaan mislukt");
        } finally {
          setSaving(false);
        }
      })
      .catch(() => undefined);
  }

  function scheduleSave(
    sellerId: string,
    snapshot: string,
    exceptionKeys: string[],
  ) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = { sellerId, snapshot, exceptionKeys };
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      pendingSaveRef.current = null;
      enqueueSave(sellerId, snapshot, exceptionKeys);
    }, 300);
  }

  function flushEditSave() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const sellerId = editingIdRef.current;
    if (!sellerId) {
      pendingSaveRef.current = null;
      return;
    }
    const built = buildAutoPayload(
      formRef.current,
      persistedExceptionKeysRef.current,
    );
    if (built) {
      pendingSaveRef.current = null;
      const snapshot = JSON.stringify(built.body);
      if (savedPayloadByIdRef.current.get(sellerId) !== snapshot) {
        enqueueSave(sellerId, snapshot, built.exceptionKeys);
      }
      return;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (
      pending &&
      savedPayloadByIdRef.current.get(pending.sellerId) !== pending.snapshot
    ) {
      enqueueSave(pending.sellerId, pending.snapshot, pending.exceptionKeys);
    }
  }

  useEffect(() => {
    if (!editingId) return;
    const built = buildAutoPayload(form, persistedExceptionKeysRef.current);
    if (built) {
      const snapshot = JSON.stringify(built.body);
      if (savedPayloadByIdRef.current.get(editingId) === snapshot) {
        pendingSaveRef.current = null;
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        return;
      }
      scheduleSave(editingId, snapshot, built.exceptionKeys);
      return;
    }

    const pending = pendingSaveRef.current;
    const base =
      pending?.sellerId === editingId
        ? pending.snapshot
        : savedPayloadByIdRef.current.get(editingId);
    if (!base) return;
    const parsed = JSON.parse(base) as { active: boolean };
    if (parsed.active === form.active) return;
    scheduleSave(
      editingId,
      JSON.stringify({ ...JSON.parse(base), active: form.active }),
      pending?.sellerId === editingId ? pending.exceptionKeys : [],
    );
  }, [form, editingId]);
  const [sortKey, setSortKey] = useState<SellerSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const mediaEntityKey = selectedEntity?.slug || "global";

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
    flushEditSave();
    const entityId = selectedEntityId;
    setEditingId(null);
    setForm({
      ...emptyForm,
      entityId,
      primaryLocationId: "",
      categoryIds: [],
      schedules: [],
      exceptions: [],
    });
    setShowForm(true);
    if (entityId) void loadEntityScopedData(entityId);
  }

  function startEdit(seller: Seller) {
    const next: FormState = {
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
      exceptions: draftExceptions(seller),
    };
    persistedExceptionKeysRef.current = new Set(
      (seller.exceptions ?? []).flatMap((item) => (item.id ? [item.id] : [])),
    );
    const built = buildAutoPayload(next, persistedExceptionKeysRef.current);
    if (built) {
      savedPayloadByIdRef.current.set(seller.id, JSON.stringify(built.body));
    }
    setEditingId(seller.id);
    setForm(next);
    setShowForm(true);
    void loadEntityScopedData(seller.entityId);
  }

  function updateSchedule(key: string, patch: Partial<DraftSchedule>) {
    setForm((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) =>
        schedule.key === key ? { ...schedule, ...patch } : schedule,
      ),
    }));
  }

  function addScheduleWeekday(weekday: Weekday) {
    setError(null);
    setForm((prev) => {
      if (prev.schedules.some((item) => item.weekday === weekday)) return prev;
      return {
        ...prev,
        schedules: [...prev.schedules, newSchedule(weekday, prev.primaryLocationId)],
      };
    });
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

    const exceptionError = validateExceptions(form.exceptions);
    if (exceptionError) {
      setError(exceptionError);
      return;
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
      exceptions: exceptionPayload(form.exceptions),
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

    if (editingId === seller.id) {
      setForm((prev) => ({ ...prev, active: nextActive }));
      return;
    }

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
          exceptions: exceptionPayload(draftExceptions(seller)),
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

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openSellerEdit(seller: Seller) {
    if (uploading) return;
    if (showForm && editingId === seller.id) {
      flushEditSave();
      closeForm();
      return;
    }
    flushEditSave();
    startEdit(seller);
  }

  const tableColSpan = 6;

  function renderSellerFormFields(mode: "create" | "edit") {
    return (
      <>
        <h2>{mode === "edit" ? "Verkoper bewerken" : "Nieuwe verkoper"}</h2>

        <button
          type="button"
          className="seller-photo"
          aria-label={form.imageUrl ? "Afbeelding wijzigen" : "Afbeelding kiezen"}
          title={form.imageUrl ? "Afbeelding wijzigen" : "Afbeelding kiezen"}
          disabled={uploading}
          onClick={() => imageInputRef.current?.click()}
        >
          {form.imageUrl ? (
            <img src={form.imageUrl} alt="" />
          ) : (
            <span aria-hidden="true">+</span>
          )}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            void onImageChange(file);
          }}
        />

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
                  exceptions: prev.exceptions.map((item) =>
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
        </div>

        <div className="stack">
          <h3>Werkschema</h3>

          {locations.length === 0 ? (
            <p className="error">
              Maak eerst minstens één locatie aan voor deze entiteit.
            </p>
          ) : null}

          <div className="schedule-week">
            {WEEKDAYS.map((day) => {
              const item = form.schedules.find(
                (schedule) => schedule.weekday === day.value,
              );

              if (!item) {
                return (
                  <div key={day.value} className="schedule-day is-empty">
                    <span className="schedule-day-name" title={day.label}>
                      {day.short}
                    </span>
                    <button
                      type="button"
                      className="schedule-day-add"
                      aria-label={`${day.label} toevoegen`}
                      onClick={() => addScheduleWeekday(day.value)}
                    >
                      <span className="add-product-circle">+</span>
                    </button>
                  </div>
                );
              }

              return (
                <div key={item.key} className="schedule-day">
                  <div className="schedule-day-head">
                    <span className="schedule-day-name" title={day.label}>
                      {day.short}
                    </span>
                    <button
                      type="button"
                      className="icon-btn schedule-day-remove"
                      aria-label={`${day.label} verwijderen`}
                      title="Dag verwijderen"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          schedules: prev.schedules.filter(
                            (schedule) => schedule.key !== item.key,
                          ),
                        }))
                      }
                    >
                      <IconTrash />
                    </button>
                  </div>
                  <label>
                    Start
                    <input
                      type="time"
                      value={item.startTime}
                      onChange={(e) =>
                        updateSchedule(item.key, { startTime: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Einde
                    <input
                      type="time"
                      value={item.endTime}
                      onChange={(e) =>
                        updateSchedule(item.key, { endTime: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Locatie
                    <select
                      value={item.locationId}
                      onChange={(e) =>
                        updateSchedule(item.key, { locationId: e.target.value })
                      }
                      required
                    >
                      <option value="">Kies…</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <div className="section-heading">
            <h3>Uitzonderingen</h3>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  exceptions: [
                    ...prev.exceptions,
                    newException(prev.primaryLocationId),
                  ],
                }))
              }
            >
              + Uitzondering
            </button>
          </div>

          {form.exceptions.map((item) => {
            const generated =
              item.startDate &&
              item.endDate &&
              item.startDate <= item.endDate
                ? expandExceptionDates(exceptionRule(item))
                : [];
            const tooMany = generated.length > MAX_EXCEPTION_DATES;
            const visibleDates = tooMany ? [] : generated;

            return (
              <div key={item.key} className="exception-card">
                <div className="exception-fields stack">
                  <div className="exception-fields-head">
                    <div className="segmented" role="radiogroup">
                      {(
                        [
                          ["OFF", "Niet werken"],
                          ["WORKING", "Wel werken"],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className={item.kind === value ? "is-selected" : ""}
                        >
                          <input
                            type="radio"
                            name={`exception-kind-${item.key}`}
                            checked={item.kind === value}
                            onChange={() =>
                              setForm((prev) => ({
                                ...prev,
                                exceptions: patchExceptions(
                                  prev.exceptions,
                                  item.key,
                                  { kind: value },
                                ),
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Uitzondering verwijderen"
                      title="Uitzondering verwijderen"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          exceptions: prev.exceptions.filter(
                            (exception) => exception.key !== item.key,
                          ),
                        }))
                      }
                    >
                      <IconTrash />
                    </button>
                  </div>

                  <div className="form-grid two">
                    <label>
                      Van
                      <input
                        type="date"
                        value={item.startDate}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            exceptions: patchExceptions(
                              prev.exceptions,
                              item.key,
                              { startDate: e.target.value },
                            ),
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Tot
                      <input
                        type="date"
                        value={item.endDate}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            exceptions: patchExceptions(
                              prev.exceptions,
                              item.key,
                              { endDate: e.target.value },
                            ),
                          }))
                        }
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Herhaling
                    <span className="repeat-every">
                      <span className="repeat-every-prefix">Elke</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_REPEAT_EVERY}
                        step={1}
                        value={item.repeatEvery}
                        onChange={(e) => {
                          const next = Math.floor(Number(e.target.value));
                          if (!Number.isFinite(next)) return;
                          setForm((prev) => ({
                            ...prev,
                            exceptions: patchExceptions(
                              prev.exceptions,
                              item.key,
                              {
                                repeatEvery: Math.min(
                                  MAX_REPEAT_EVERY,
                                  Math.max(1, next),
                                ),
                              },
                            ),
                          }));
                        }}
                        required
                      />
                      <select
                        value={item.repeatUnit}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            exceptions: patchExceptions(
                              prev.exceptions,
                              item.key,
                              {
                                repeatUnit: e.target
                                  .value as ExceptionRepeatUnit,
                              },
                            ),
                          }))
                        }
                      >
                        <option value="DAY">
                          {item.repeatEvery === 1 ? "dag" : "dagen"}
                        </option>
                        <option value="WEEK">
                          {item.repeatEvery === 1 ? "week" : "weken"}
                        </option>
                        <option value="MONTH">
                          {item.repeatEvery === 1 ? "maand" : "maanden"}
                        </option>
                      </select>
                    </span>
                  </label>

                  {item.kind === "WORKING" ? (
                    <>
                    <div className="form-grid two">
                      <label>
                        Start
                        <input
                          type="time"
                          value={item.startTime}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              exceptions: patchExceptions(
                                prev.exceptions,
                                item.key,
                                { startTime: e.target.value },
                              ),
                            }))
                          }
                          required
                        />
                      </label>
                      <label>
                        Einde
                        <input
                          type="time"
                          value={item.endTime}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              exceptions: patchExceptions(
                                prev.exceptions,
                                item.key,
                                { endTime: e.target.value },
                              ),
                            }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Locatie
                      <select
                        value={item.locationId}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            exceptions: patchExceptions(
                              prev.exceptions,
                              item.key,
                              { locationId: e.target.value },
                            ),
                          }))
                        }
                        required
                      >
                        <option value="">Kies…</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    </>
                  ) : null}
                </div>

                <div className="exception-dates-pane">
                  {item.startDate &&
                  item.endDate &&
                  item.startDate > item.endDate ? (
                    <p className="error">
                      Einddatum moet op of na de begindatum liggen.
                    </p>
                  ) : tooMany ? (
                    <p className="error">
                      Deze reeks bevat meer dan {MAX_EXCEPTION_DATES} dagen.
                    </p>
                  ) : (
                    <div className="exception-dates">
                      {visibleDates.map((date) => {
                        const excluded = item.excludedDates.includes(date);
                        return (
                          <button
                            key={date}
                            type="button"
                            className={`exception-date${excluded ? " is-excluded" : ""}`}
                            aria-pressed={!excluded}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                exceptions: patchExceptions(
                                  prev.exceptions,
                                  item.key,
                                  {
                                    excludedDates: excluded
                                      ? item.excludedDates.filter(
                                          (value) => value !== date,
                                        )
                                      : [...item.excludedDates, date],
                                  },
                                ),
                              }))
                            }
                          >
                            {formatChipDate(date)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

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
              disabled={saving || uploading}
            >
              {saving ? "Opslaan…" : "Opslaan"}
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
                      <tr
                        className={`row-clickable${showForm && editingId === seller.id ? " is-open" : ""}`}
                        onClick={() => openSellerEdit(seller)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
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
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="row-actions">
                            <button
                              type="button"
                              className={`icon-btn${showForm && editingId === seller.id ? " is-active" : ""}`}
                              aria-label="Bewerken"
                              title="Bewerken"
                              disabled={uploading}
                              onClick={() => openSellerEdit(seller)}
                            >
                              <IconPencil />
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
                              onSubmit={(event) => {
                                event.preventDefault();
                                flushEditSave();
                              }}
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
                      <tr
                        className={`row-clickable${showForm && editingId === seller.id ? " is-open" : ""}`}
                        onClick={() => openSellerEdit(seller)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
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
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="row-actions">
                            <button
                              type="button"
                              className={`icon-btn${showForm && editingId === seller.id ? " is-active" : ""}`}
                              aria-label="Bewerken"
                              title="Bewerken"
                              disabled={uploading}
                              onClick={() => openSellerEdit(seller)}
                            >
                              <IconPencil />
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
                              onSubmit={(event) => {
                                event.preventDefault();
                                flushEditSave();
                              }}
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
