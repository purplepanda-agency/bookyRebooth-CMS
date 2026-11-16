import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAccessibleEntities } from "../auth/entityAccess";

type BreakdownRow = {
  id: string;
  name: string;
  count: number;
};

type DayMetrics = {
  date: string;
  success: number;
  failed: number;
  emailError: number;
  makeError: number;
};

type StatsOverview = {
  days: number;
  entityId: string | null;
  from: string;
  to: string;
  health: {
    notFound404: number;
    formSubmitError: number;
    emailError: number;
    makeError: number;
    makeComingSoon: true;
  };
  analytics: {
    successfulSubmissions: number;
    failedSubmissions: number;
    emailErrors: number;
    makeErrors: number;
    metricsByDay: DayMetrics[];
    bySeller: BreakdownRow[];
    byLocation: BreakdownRow[];
    byCategory: BreakdownRow[];
  };
};

function formatDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

function formatChartDay(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}`;
}

function formatDisplayDate(date: string) {
  const [y, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}/${y}`;
}

function MetricsChart({
  periodLabel,
  series,
}: {
  periodLabel: string;
  series: DayMetrics[];
}) {
  const max = Math.max(
    1,
    ...series.map((row) =>
      Math.max(row.success + row.failed, row.emailError, row.makeError),
    ),
  );
  const hasData = series.some(
    (row) =>
      row.success > 0 ||
      row.failed > 0 ||
      row.emailError > 0 ||
      row.makeError > 0,
  );
  const showEvery = series.length > 14 ? Math.ceil(series.length / 8) : 1;

  const width = 640;
  const height = 180;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 8;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const slot = series.length > 0 ? plotW / series.length : plotW;
  const barWidth = Math.max(2, slot * 0.55);

  function xCenter(index: number) {
    return padL + slot * index + slot / 2;
  }

  function yValue(value: number) {
    return padT + plotH - (value / max) * plotH;
  }

  function linePoints(getter: (row: DayMetrics) => number) {
    return series
      .map((row, index) => `${xCenter(index)},${yValue(getter(row))}`)
      .join(" ");
  }

  return (
    <div className="stats-chart">
      <div className="stats-chart-header">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Inzendingen & fouten per dag</h3>
        <p className="muted" style={{ margin: 0 }}>
          {periodLabel}
        </p>
      </div>

      <div className="stats-chart-legend">
        <span className="stats-chart-legend-item">
          <span className="stats-chart-swatch stats-chart-swatch-success" />
          Gelukt
        </span>
        <span className="stats-chart-legend-item">
          <span className="stats-chart-swatch stats-chart-swatch-failed" />
          Mislukt
        </span>
        <span className="stats-chart-legend-item">
          <span className="stats-chart-swatch stats-chart-swatch-email" />
          E-mailfouten
        </span>
        <span className="stats-chart-legend-item">
          <span className="stats-chart-swatch stats-chart-swatch-make" />
          Make-fouten
        </span>
      </div>

      {!hasData ? (
        <p className="muted" style={{ margin: 0 }}>
          Nog geen data in deze periode
        </p>
      ) : (
        <div
          className="stats-chart-body"
          role="img"
          aria-label="Gestapelde staafgrafiek met lijnen voor e-mail- en Make-fouten"
        >
          <svg
            className="stats-chart-svg"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            {[0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = padT + plotH * (1 - fraction);
              return (
                <line
                  key={fraction}
                  className="stats-chart-grid"
                  x1={padL}
                  x2={width - padR}
                  y1={y}
                  y2={y}
                />
              );
            })}

            {series.map((row, index) => {
              const successH = (row.success / max) * plotH;
              const failedH = (row.failed / max) * plotH;
              const x = xCenter(index) - barWidth / 2;
              const successY = padT + plotH - successH;
              const failedY = successY - failedH;
              const tip = [
                formatChartDay(row.date),
                `Gelukt: ${row.success}`,
                `Mislukt: ${row.failed}`,
                `E-mail: ${row.emailError}`,
                `Make: ${row.makeError}`,
              ].join(" · ");

              return (
                <g key={row.date}>
                  <title>{tip}</title>
                  {row.success > 0 ? (
                    <rect
                      className="stats-chart-bar-success"
                      x={x}
                      y={successY}
                      width={barWidth}
                      height={Math.max(successH, 1)}
                    />
                  ) : null}
                  {row.failed > 0 ? (
                    <rect
                      className="stats-chart-bar-failed"
                      x={x}
                      y={failedY}
                      width={barWidth}
                      height={Math.max(failedH, 1)}
                    />
                  ) : null}
                </g>
              );
            })}

            <polyline
              className="stats-chart-line-email"
              fill="none"
              points={linePoints((row) => row.emailError)}
            />
            <polyline
              className="stats-chart-line-make"
              fill="none"
              points={linePoints((row) => row.makeError)}
            />

            {series.map((row, index) => (
              <circle
                key={`email-${row.date}`}
                className="stats-chart-dot-email"
                cx={xCenter(index)}
                cy={yValue(row.emailError)}
                r={series.length > 20 ? 1.5 : 2.2}
              />
            ))}
            {series.map((row, index) => (
              <circle
                key={`make-${row.date}`}
                className="stats-chart-dot-make"
                cx={xCenter(index)}
                cy={yValue(row.makeError)}
                r={series.length > 20 ? 1.5 : 2.2}
              />
            ))}
          </svg>
          <div className="stats-chart-axis">
            {series.map((row, index) => {
              const showLabel =
                index % showEvery === 0 || index === series.length - 1;
              return (
                <span
                  key={row.date}
                  className={
                    showLabel
                      ? "stats-chart-axis-label"
                      : "stats-chart-axis-label stats-chart-axis-label-spacer"
                  }
                >
                  {showLabel ? formatChartDay(row.date) : null}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyLabel: string;
}) {
  return (
    <div className="stats-breakdown stack">
      <h3 style={{ margin: 0, fontSize: "1rem" }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {emptyLabel}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Naam</th>
              <th style={{ width: 88, textAlign: "right" }}>Aantal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td style={{ textAlign: "right" }}>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function HomePage() {
  const { user, isSuper, selectedEntity, selectedEntityId, settleEntityTransition } =
    useAccessibleEntities();
  const hasLoadedRef = useRef(false);
  const [fromDate, setFromDate] = useState(() => defaultDateRange().from);
  const [toDate, setToDate] = useState(() => defaultDateRange().to);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromDate || !toDate) return;

    let cancelled = false;

    async function load() {
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
        });
        if (selectedEntityId) {
          params.set("entityId", selectedEntityId);
        }
        const data = await api<{ overview: StatsOverview }>(
          `/stats/overview?${params.toString()}`,
        );
        if (!cancelled) {
          setOverview(data.overview);
          hasLoadedRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
          setOverview(null);
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
  }, [selectedEntityId, fromDate, toDate, settleEntityTransition]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Overzicht</h1>
          <p>Welkom in de beheeromgeving van Booky CMS.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <div className="panel-body stack">
          <p>
            Je bent ingelogd als <strong>{user?.email}</strong>
            {selectedEntity ? (
              <>
                {" "}
                voor <strong>{selectedEntity.name}</strong>
              </>
            ) : null}
            .
          </p>

          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <Link className="btn" to="/locations">
              Locaties
            </Link>
            <Link className="btn btn-secondary" to="/sellers">
              Verkopers
            </Link>
            {isSuper ? (
              <Link className="btn btn-secondary" to="/entities">
                Entiteiten
              </Link>
            ) : (
              <Link className="btn btn-secondary" to="/users">
                Gebruikers
              </Link>
            )}
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="panel-body stack">
          <div className="stats-section-header">
            <div>
              <h2 style={{ fontSize: "1.15rem" }}>Analytics &amp; gezondheid</h2>
              <p className="muted" style={{ marginTop: "0.25rem" }}>
                Boekingsinzendingen en fouten
                {overview
                  ? ` · ${overview.days} dag${overview.days === 1 ? "" : "en"}`
                  : null}
              </p>
            </div>
            <div className="stats-date-range">
              <label className="field" style={{ margin: 0 }}>
                <span>Van</span>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>Tot</span>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={formatDateInput(new Date())}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </label>
            </div>
          </div>

          {loading && !overview ? (
            <p className="muted">Statistieken laden…</p>
          ) : null}

          {overview ? (
            <>
              <div className="stats-cards">
                <div className="stats-card">
                  <span className="stats-card-label">
                    Succesvolle inzendingen
                  </span>
                  <strong className="stats-card-value">
                    {overview.analytics.successfulSubmissions}
                  </strong>
                </div>
                <div className="stats-card">
                  <span className="stats-card-label">Mislukte inzendingen</span>
                  <strong className="stats-card-value">
                    {overview.analytics.failedSubmissions ??
                      overview.health.formSubmitError}
                  </strong>
                </div>
                <div className="stats-card">
                  <span className="stats-card-label">E-mailfouten</span>
                  <strong className="stats-card-value">
                    {overview.analytics.emailErrors ??
                      overview.health.emailError}
                  </strong>
                </div>
                <div className="stats-card stats-card-muted">
                  <span className="stats-card-label">Make-fouten</span>
                  <strong className="stats-card-value">
                    {overview.analytics.makeErrors ?? overview.health.makeError}
                  </strong>
                  <span className="stats-card-note">Coming soon</span>
                </div>
              </div>

              <MetricsChart
                periodLabel={`${formatDisplayDate(overview.from)} – ${formatDisplayDate(overview.to)}`}
                series={overview.analytics.metricsByDay ?? []}
              />

              <div className="stats-breakdown-grid">
                <BreakdownTable
                  title="Per verkoper"
                  rows={overview.analytics.bySeller}
                  emptyLabel="Nog geen data"
                />
                <BreakdownTable
                  title="Per locatie"
                  rows={overview.analytics.byLocation}
                  emptyLabel="Nog geen data"
                />
                <BreakdownTable
                  title="Per categorie"
                  rows={overview.analytics.byCategory}
                  emptyLabel="Nog geen data"
                />
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
