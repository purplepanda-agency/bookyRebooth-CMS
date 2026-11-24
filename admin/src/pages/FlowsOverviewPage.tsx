import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Flow } from "../api/types";
import { IconPencil, IconTrash } from "../components/RowActionIcons";
import { useAccessibleEntities } from "../auth/entityAccess";

function IconChevronUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 10L8 6L12 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlowsOverviewPage() {
  const navigate = useNavigate();
  const { selectedEntityId, settleEntityTransition } = useAccessibleEntities();
  const hasLoadedRef = useRef(false);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const query = selectedEntityId
          ? `?entityId=${encodeURIComponent(selectedEntityId)}`
          : "";
        const data = await api<{ flows: Flow[] }>(`/flows${query}`);
        if (!cancelled) {
          setFlows(data.flows);
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

  async function createFlow() {
    setCreating(true);
    setError(null);
    try {
      const entityId = selectedEntityId;

      if (!entityId) {
        setError("Kies eerst een entiteit");
        setCreating(false);
        return;
      }

      const data = await api<{ flow: Flow }>("/flows", {
        method: "POST",
        body: JSON.stringify({
          name: "Nieuwe flow",
          steps: [],
          entityId,
        }),
      });

      navigate(`/new-flow/${data.flow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aanmaken mislukt");
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Deze flow verwijderen?")) return;
    setError(null);
    try {
      await api(`/flows/${id}`, { method: "DELETE" });
      setFlows((prev) => prev.filter((flow) => flow.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function toggleActive(flow: Flow) {
    const nextActive = !flow.active;
    setError(null);
    setFlows((prev) =>
      prev.map((item) =>
        item.id === flow.id ? { ...item, active: nextActive } : item,
      ),
    );

    try {
      await api(`/flows/${flow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });
    } catch (err) {
      setFlows((prev) =>
        prev.map((item) =>
          item.id === flow.id ? { ...item, active: flow.active } : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Status wijzigen mislukt");
    }
  }

  async function moveFlow(flow: Flow, direction: -1 | 1) {
    const siblings = flows.filter((item) => item.entityId === flow.entityId);
    const index = siblings.findIndex((item) => item.id === flow.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

    const orderedIds = siblings.map((item) => item.id);
    const swapId = orderedIds[targetIndex]!;
    orderedIds[targetIndex] = orderedIds[index]!;
    orderedIds[index] = swapId;

    const previous = flows;
    const reorderedSiblings: Flow[] = orderedIds.flatMap((id, sortOrder) => {
      const item = siblings.find((flowItem) => flowItem.id === id);
      return item ? [{ ...item, sortOrder }] : [];
    });

    setFlows((prev) => {
      const others = prev.filter((item) => item.entityId !== flow.entityId);
      return [...others, ...reorderedSiblings];
    });
    setReorderingId(flow.id);
    setError(null);

    try {
      const data = await api<{ flows: Flow[] }>("/flows/reorder", {
        method: "PUT",
        body: JSON.stringify({
          orderedIds,
          entityId: flow.entityId,
        }),
      });
      setFlows((prev) => {
        const others = prev.filter((item) => item.entityId !== flow.entityId);
        return [...others, ...data.flows];
      });
    } catch (err) {
      setFlows(previous);
      setError(err instanceof Error ? err.message : "Volgorde wijzigen mislukt");
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Flows</h1>
          <p>Overzicht van bookingflows voor jouw entiteit.</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void createFlow()}
          disabled={creating}
        >
          {creating ? "Aanmaken…" : "Nieuwe flow"}
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
        ) : flows.length === 0 ? (
          <div className="empty">Nog geen flows.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 88 }}>Volgorde</th>
                <th>Naam</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Stappen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => {
                const siblings = flows.filter(
                  (item) => item.entityId === flow.entityId,
                );
                const index = siblings.findIndex((item) => item.id === flow.id);
                const busy = reorderingId === flow.id;

                return (
                  <tr
                    key={flow.id}
                    className="row-clickable"
                    onClick={() => navigate(`/new-flow/${flow.id}`)}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Omhoog"
                          aria-label="Omhoog"
                          disabled={busy || index <= 0}
                          onClick={() => void moveFlow(flow, -1)}
                        >
                          <IconChevronUp />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Omlaag"
                          aria-label="Omlaag"
                          disabled={busy || index >= siblings.length - 1}
                          onClick={() => void moveFlow(flow, 1)}
                        >
                          <IconChevronDown />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        {flow.featuredImage ? (
                          <img
                            src={flow.featuredImage}
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
                        <span>{flow.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{flow.slug || "—"}</span>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <label className="switch-row switch-row-compact">
                        <span className="switch">
                          <input
                            type="checkbox"
                            checked={flow.active}
                            onChange={() => void toggleActive(flow)}
                            aria-label={
                              flow.active ? "Deactiveer flow" : "Activeer flow"
                            }
                          />
                          <span className="switch-slider" />
                        </span>
                        <span className="muted">
                          {flow.active ? "Actief" : "Inactief"}
                        </span>
                      </label>
                    </td>
                    <td>
                      <span className="badge">{flow._count?.steps ?? 0}</span>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        <Link
                          className="icon-btn"
                          to={`/new-flow/${flow.id}`}
                          aria-label="Bewerken"
                          title="Bewerken"
                        >
                          <IconPencil />
                        </Link>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Verwijderen"
                          title="Verwijderen"
                          onClick={() => void onDelete(flow.id)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
