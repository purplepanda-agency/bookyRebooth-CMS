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
  summary: string;
  detail: string | null;
  entityName: string | null;
};

type ActivityResponse = {
  entries: ActivityEntry[];
  nextCursor: string | null;
};

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

function activityPath(options: {
  q: string;
  userId: string;
  entityId: string;
  cursor?: string | null;
}) {
  const params = new URLSearchParams();
  const q = options.q.trim();
  if (q) params.set("q", q);
  if (options.userId) params.set("userId", options.userId);
  if (options.entityId) params.set("entityId", options.entityId);
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

export function ActivityPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [users, setUsers] = useState<User[]>([]);
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
            activityPath({ q: query, userId, entityId }),
          );
          if (cancelled) return;
          setEntries(data.entries);
          setNextCursor(data.nextCursor);
        } catch (err) {
          if (!cancelled) {
            setEntries([]);
            setNextCursor(null);
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
  }, [isSuper, query, userId, entityId]);

  if (!isSuper) {
    return <Navigate to="/" replace />;
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await api<ActivityResponse>(
        activityPath({ q: query, userId, entityId, cursor: nextCursor }),
      );
      setEntries((current) => [...current, ...data.entries]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden mislukt");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = Boolean(query.trim() || userId || entityId);

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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Naam, e-mail of entiteit"
          />
        </label>
        <label>
          Gebruiker
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Alle gebruikers</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entiteit
          <select
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
          >
            <option value="">Alle entiteiten</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
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
                  <th>Wat</th>
                  <th>Entiteit</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="activity-when">{formatWhen(entry.createdAt)}</td>
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
                    <td>
                      <div className="activity-summary">
                        <span>{entry.summary}</span>
                        {entry.detail ? (
                          <span className="activity-detail">{entry.detail}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{entry.entityName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nextCursor ? (
              <div className="activity-more">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Laden…" : "Meer laden"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
