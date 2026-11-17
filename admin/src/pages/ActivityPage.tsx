import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import type { EntitySummary, Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";

type ActivityAction = "create" | "update" | "delete";

type ActivityEntry = {
  id: string;
  createdAt: string;
  userEmail: string;
  userRole: Role;
  action: ActivityAction | string;
  entryType: string | null;
  summary: string;
  detail: string | null;
  entityName: string | null;
};

type ActivityResponse = {
  entries: ActivityEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 20;

const ENTRY_TYPES = [
  "Entiteiten",
  "Gebruikers",
  "Locaties",
  "Verkopers",
  "Categorieën",
  "Flows",
  "Contentblokken",
  "Product sets",
] as const;

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
};

const actionLabel: Record<string, string> = {
  create: "Aangemaakt",
  update: "Bijgewerkt",
  delete: "Verwijderd",
};

function actionClass(action: string) {
  if (action === "create") return "badge badge-success";
  if (action === "delete") return "badge badge-danger";
  return "badge ok";
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Split legacy summaries like `Locatie «X» bijgewerkt` into type + record. */
function displayWat(entry: ActivityEntry): {
  entryType: string;
  what: string;
} {
  if (entry.entryType) {
    return { entryType: entry.entryType, what: entry.summary || "—" };
  }

  const summary = entry.summary;

  const password = summary.match(/^Wachtwoord van «(.+?)» gewijzigd$/);
  if (password) {
    return { entryType: "Gebruikers", what: password[1]! };
  }

  const reorder = summary.match(/^Volgorde van (\d+) flows aangepast$/i);
  if (reorder) {
    return { entryType: "Flows", what: `Volgorde (${reorder[1]})` };
  }

  const group = summary.match(
    /^(.+?)\s+(?:aangemaakt|bijgewerkt|verwijderd):\s*(.+)$/,
  );
  if (group) {
    return {
      entryType: group[1]!,
      what: group[2]!.replaceAll(/[«»]/g, ""),
    };
  }

  const one = summary.match(
    /^(.+?)\s+«(.+?)»\s+(?:aangemaakt|bijgewerkt|verwijderd)$/,
  );
  if (one) {
    return { entryType: one[1]!, what: one[2]! };
  }

  const bare = summary.match(
    /^(.+?)\s+(?:aangemaakt|bijgewerkt|verwijderd)$/,
  );
  if (bare) {
    return { entryType: bare[1]!, what: "—" };
  }

  return { entryType: "—", what: summary || "—" };
}

function activityPath(options: {
  q: string;
  userId: string;
  entityId: string;
  entryType: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}) {
  const params = new URLSearchParams();
  const q = options.q.trim();
  if (q) params.set("q", q);
  if (options.userId) params.set("userId", options.userId);
  if (options.entityId) params.set("entityId", options.entityId);
  if (options.entryType) params.set("entryType", options.entryType);
  if (options.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options.dateTo) params.set("dateTo", options.dateTo);
  params.set("page", String(options.page));
  params.set("limit", String(PAGE_SIZE));
  return `/activity?${params.toString()}`;
}

export function ActivityPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [users, setUsers] = useState<User[]>([]);
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [entryType, setEntryType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;

    Promise.all([
      api<{ users: User[] }>("/users"),
      api<{ entities: EntitySummary[] }>("/entities"),
    ])
      .then(([usersData, entitiesData]) => {
        if (cancelled) return;
        setUsers(
          [...usersData.users].sort((a, b) =>
            a.email.localeCompare(b.email, "nl"),
          ),
        );
        setEntities(
          [...entitiesData.entities].sort((a, b) =>
            a.name.localeCompare(b.name, "nl"),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setUsers([]);
        setEntities([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isSuper]);

  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await api<ActivityResponse>(
            activityPath({
              q: query,
              userId,
              entityId,
              entryType,
              dateFrom,
              dateTo,
              page,
            }),
          );
          if (cancelled) return;
          setEntries(data.entries);
          setTotal(data.total);
          setTotalPages(data.totalPages);
          if (data.page !== page) setPage(data.page);
        } catch (err) {
          if (!cancelled) {
            setEntries([]);
            setTotal(0);
            setTotalPages(1);
            setError(err instanceof Error ? err.message : "Laden mislukt");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, query.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isSuper, query, userId, entityId, entryType, dateFrom, dateTo, page]);

  if (!isSuper) {
    return <Navigate to="/" replace />;
  }

  const filtered = Boolean(
    query.trim() || userId || entityId || entryType || dateFrom || dateTo,
  );
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  function resetPage() {
    setPage(1);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Activiteit</h1>
          <p>
            Wie iets heeft opgeslagen, en wanneer. Nieuwe wijzigingen komen
            hier vanaf nu in de log.
          </p>
        </div>
      </div>

      <div className="activity-filters">
        <label>
          Zoeken
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
            placeholder="Naam, e-mail of entiteit"
          />
        </label>
        <label>
          Type
          <select
            value={entryType}
            onChange={(event) => {
              setEntryType(event.target.value);
              resetPage();
            }}
          >
            <option value="">Alle types</option>
            {ENTRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gebruiker
          <select
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              resetPage();
            }}
          >
            <option value="">Alle gebruikers</option>
            {users.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entiteit
          <select
            value={entityId}
            onChange={(event) => {
              setEntityId(event.target.value);
              resetPage();
            }}
          >
            <option value="">Alle entiteiten</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Van
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value);
              resetPage();
            }}
          />
        </label>
        <label>
          Tot
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              resetPage();
            }}
          />
        </label>
      </div>

      {error ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="panel">
        {loading ? (
          <div className="empty">Laden…</div>
        ) : entries.length === 0 ? (
          <div className="empty">
            {filtered
              ? "Geen activiteit gevonden voor deze filters."
              : "Nog geen activiteit. Wijzigingen die gebruikers opslaan verschijnen hier."}
          </div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Wanneer</th>
                  <th>Wie</th>
                  <th>Actie</th>
                  <th>Type</th>
                  <th>Wat</th>
                  <th>Entiteit</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const { entryType: typeLabel, what } = displayWat(entry);
                  return (
                    <tr key={entry.id}>
                      <td className="activity-when">
                        {formatWhen(entry.createdAt)}
                      </td>
                      <td>
                        <div>{entry.userEmail}</div>
                        <div className="activity-detail">
                          {roleLabel[entry.userRole] ?? entry.userRole}
                        </div>
                      </td>
                      <td>
                        <span className={actionClass(entry.action)}>
                          {actionLabel[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td>{typeLabel}</td>
                      <td>
                        <div className="activity-summary">
                          <span>{what}</span>
                          {entry.detail ? (
                            <span className="activity-detail">
                              {entry.detail}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{entry.entityName || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="activity-pagination">
              <span className="activity-pagination-meta">
                {from}–{to} van {total}
              </span>
              <div className="activity-pagination-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Vorige
                </button>
                <span className="activity-pagination-page">
                  Pagina {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Volgende
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
