import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { api } from "../api/client";
import type { Role, User } from "../api/types";
import { useAccessibleEntities } from "../auth/entityAccess";

type SelectOption = { value: string; label: string };

type FormState = {
  email: string;
  password: string;
  role: Role;
  entityIds: string[];
};

const emptyForm: FormState = {
  email: "",
  password: "",
  role: "ADMIN",
  entityIds: [],
};

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
};

function formatLastLogin(value: string | null | undefined) {
  if (!value) return "Nog nooit";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function UsersPage() {
  const {
    user,
    isSuper,
    entities,
    canChooseEntity,
    fixedEntity,
    selectedEntity,
  } = useAccessibleEntities();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const tableColSpan = 5;

  // Superadmin: full catalog. Admin: only entities they are assigned to.
  // Never expose the superadmin catalog to a scoped admin account.
  const ownedEntities = useMemo(
    () => (isSuper ? entities : (user?.entities ?? [])),
    [isSuper, entities, user?.entities],
  );

  const ownedIds = useMemo(
    () => new Set(ownedEntities.map((entity) => entity.id)),
    [ownedEntities],
  );

  // Admins manage users in the active entity context, so the picker only
  // offers that entity (not other dealers they may also belong to).
  const assignableEntities = useMemo(() => {
    if (isSuper) return entities;
    if (selectedEntity && ownedIds.has(selectedEntity.id)) {
      return [selectedEntity];
    }
    return ownedEntities;
  }, [isSuper, entities, selectedEntity, ownedEntities, ownedIds]);

  const entityOptions = useMemo<SelectOption[]>(
    () =>
      assignableEntities.map((entity) => ({
        value: entity.id,
        label: entity.name,
      })),
    [assignableEntities],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const usersData = await api<{ users: User[] }>("/users");
      setUsers(usersData.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function defaultEntityIds() {
    if (isSuper) return [];
    return assignableEntities.map((entity) => entity.id);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      role: "ADMIN",
      entityIds: defaultEntityIds(),
    });
    setShowForm(true);
  }

  function openEditForm(item: User) {
    setEditingId(item.id);
    const visibleIds = item.entities
      .map((entity) => entity.id)
      .filter((entityId) => ownedIds.has(entityId));
    // Only preselect entities that are offered in the current picker context.
    const scopedIds = visibleIds.filter((entityId) =>
      assignableEntities.some((entity) => entity.id === entityId),
    );
    setForm({
      email: item.email,
      password: "",
      role: item.role,
      entityIds: scopedIds,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function resolveEntityIdsForSave(existing: User | undefined) {
    if (form.role === "SUPER_ADMIN") return [];

    if (isSuper) return form.entityIds;

    if (!canChooseEntity && fixedEntity) {
      return [fixedEntity.id];
    }

    // Keep assignments the admin owns outside the active entity context.
    // The picker only toggles membership for the currently selectable entities.
    const preserved = (existing?.entities ?? [])
      .map((entity) => entity.id)
      .filter(
        (entityId) =>
          ownedIds.has(entityId) &&
          !assignableEntities.some((entity) => entity.id === entityId),
      );

    return [...new Set([...preserved, ...form.entityIds])];
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const existing = editingId
      ? users.find((item) => item.id === editingId)
      : undefined;
    const entityIds = resolveEntityIdsForSave(existing);

    if (form.role === "ADMIN" && entityIds.length === 0) {
      setError("Kies minstens één entiteit");
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        const patchBody = isSuper
          ? {
              role: form.role,
              entityIds,
              ...(form.password.trim()
                ? { password: form.password.trim() }
                : {}),
            }
          : { entityIds };
        await api(`/users/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        });
      } else {
        const payload = isSuper
          ? {
              email: form.email,
              password: form.password,
              role: form.role,
              entityIds,
            }
          : {
              email: form.email,
              password: form.password,
              entityIds,
            };

        await api("/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  const showEntityPicker =
    form.role === "ADMIN" && (isSuper ? entities.length > 0 : canChooseEntity);
  const editingSelf = editingId === user?.id;
  const activeEntityName =
    selectedEntity?.name ?? fixedEntity?.name ?? assignableEntities[0]?.name;

  async function onDelete(item: User) {
    if (!isSuper) return;
    if (item.id === user?.id) {
      setError("Je kunt jezelf niet verwijderen");
      return;
    }
    if (!window.confirm(`Gebruiker “${item.email}” verwijderen?`)) return;
    setError(null);
    try {
      await api(`/users/${item.id}`, { method: "DELETE" });
      if (editingId === item.id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  function renderUserFormFields(mode: "create" | "edit") {
    return (
      <>
        <h2>
          {mode === "edit" ? "Gebruiker bewerken" : "Nieuwe gebruiker"}
        </h2>
        {!isSuper && !showEntityPicker && activeEntityName ? (
          <p className="muted" style={{ margin: 0 }}>
            {mode === "edit" ? "Blijft gekoppeld aan" : "Wordt toegevoegd aan"}{" "}
            <strong>{activeEntityName}</strong> als admin.
          </p>
        ) : null}
        <div className="form-grid two">
          <label>
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              required
              disabled={mode === "edit"}
            />
          </label>
          {mode === "create" || isSuper ? (
            <label>
              {mode === "edit" ? "Nieuw wachtwoord" : "Wachtwoord"}
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
                minLength={mode === "create" ? 8 : undefined}
                pattern={
                  mode === "create" || form.password
                    ? "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}"
                    : undefined
                }
                title="Minimaal 8 tekens, met hoofdletter, kleine letter, cijfer en speciaal teken"
                required={mode === "create"}
                placeholder={
                  mode === "edit" ? "Leeg laten om niet te wijzigen" : undefined
                }
                autoComplete="new-password"
              />
            </label>
          ) : null}
          {mode === "create" || (isSuper && mode === "edit") ? (
            <p className="muted" style={{ margin: 0, gridColumn: "1 / -1" }}>
              {mode === "edit"
                ? "Laat leeg om het wachtwoord te behouden. Nieuwe wachtwoorden: minimaal 8 tekens, met hoofdletter, kleine letter, cijfer en speciaal teken."
                : "Minimaal 8 tekens, met hoofdletter, kleine letter, cijfer en speciaal teken."}
            </p>
          ) : null}
          {isSuper ? (
            <label>
              Rol
              <select
                value={form.role}
                disabled={editingSelf}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    role: e.target.value as Role,
                    entityIds:
                      e.target.value === "SUPER_ADMIN" ? [] : prev.entityIds,
                  }))
                }
              >
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super admin</option>
              </select>
            </label>
          ) : null}
          {showEntityPicker ? (
            <label style={{ gridColumn: "1 / -1" }}>
              Entiteiten
              <Select<SelectOption, true>
                isMulti
                classNamePrefix="rs"
                options={entityOptions}
                value={entityOptions.filter((option) =>
                  form.entityIds.includes(option.value),
                )}
                onChange={(selected) =>
                  setForm((prev) => ({
                    ...prev,
                    entityIds: selected.map((option) => option.value),
                  }))
                }
                placeholder="Selecteer entiteiten…"
                noOptionsMessage={() => "Geen entiteiten"}
              />
            </label>
          ) : null}
        </div>
        {form.role === "SUPER_ADMIN" ? (
          <p className="muted" style={{ margin: 0 }}>
            Een super admin heeft toegang tot alle entiteiten en kan later
            extra beheerfuncties krijgen.
          </p>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={closeForm}
          >
            Annuleren
          </button>
          <button type="submit" className="btn" disabled={saving}>
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
          <h1>Gebruikers</h1>
          <p>
            {isSuper
              ? "Super admins werken in alle entiteiten. Admins krijgen één of meer entiteiten toegewezen."
              : "Voeg collega-admins toe binnen jouw entiteiten."}
          </p>
        </div>
        <button type="button" className="btn" onClick={openCreateForm}>
          Nieuwe gebruiker
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
        ) : users.length === 0 ? (
          <div className="empty">Nog geen gebruikers.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Rol</th>
                <th>Entiteiten</th>
                <th>Laatst ingelogd</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td>{item.email}</td>
                    <td>
                      <span className="badge">{roleLabel[item.role]}</span>
                    </td>
                    <td>
                      {item.role === "SUPER_ADMIN" ? (
                        <span className="muted">Alle entiteiten</span>
                      ) : item.entities.length === 0 ? (
                        "—"
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.35rem",
                          }}
                        >
                          {item.entities.map((entity) => (
                            <span key={entity.id} className="badge">
                              {entity.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{formatLastLogin(item.lastLoggedInAt)}</td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className={
                            showForm && editingId === item.id
                              ? "btn btn-small"
                              : "btn btn-secondary btn-small"
                          }
                          disabled={
                            (showForm &&
                              Boolean(editingId) &&
                              editingId !== item.id) ||
                            (editingId === item.id && saving)
                          }
                          onClick={() => {
                            if (showForm && editingId === item.id) {
                              (
                                document.getElementById(
                                  "user-form-edit",
                                ) as HTMLFormElement | null
                              )?.requestSubmit();
                              return;
                            }
                            openEditForm(item);
                          }}
                        >
                          {showForm && editingId === item.id
                            ? saving
                              ? "Opslaan…"
                              : "Opslaan"
                            : "Bewerken"}
                        </button>
                        {isSuper && item.id !== user?.id ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={saving}
                            onClick={() => void onDelete(item)}
                          >
                            Verwijderen
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {showForm && editingId === item.id ? (
                    <tr className="table-row-expand">
                      <td colSpan={tableColSpan}>
                        <form
                          id="user-form-edit"
                          className="table-expand-panel stack"
                          onSubmit={onSubmit}
                        >
                          {renderUserFormFields("edit")}
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
            id="user-form-create"
            className="drawer stack"
            onSubmit={onSubmit}
          >
            {renderUserFormFields("create")}
          </form>
        ) : null}
      </div>
    </div>
  );
}
