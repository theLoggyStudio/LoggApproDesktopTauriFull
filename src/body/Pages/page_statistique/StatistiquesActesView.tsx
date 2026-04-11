/**
 * Vue principale des statistiques d’actes (refonte complète).
 * Données : useStatistiquesActes — UI découpée en sections lisibles.
 */
import React, { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { upperLow } from "../../helpers/helpers.js";
import { themes } from "../../../constants/index.ts";
import { Input } from "../../../items/Input.tsx";
import { useTheme } from "../../context/ThemeContext.js";
import { useStatistiquesActes, type StatistiquesRow } from "../../hooks/useStatistiquesActes.js";
import { StatistiquesFiltreActes } from "../../Modules/statistiques/StatistiquesFiltreActes.js";
import { Table as Tables } from "../../../items/Table.tsx";

export type StatistiquesActesViewProps = {
  tabId: string;
  pays: string;
};

function axisLabel(abscisseType: string): string {
  switch (abscisseType) {
    case "date":
      return "Date";
    case "type_acte":
      return "Type d'acte";
    case "tranche_prix":
      return "Tranche de prix";
    case "type_assurance":
      return "Type d'assurance";
    case "statut_paiement":
      return "Statut de paiement";
    case "jour_semaine":
      return "Jour de la semaine";
    default:
      return "Catégorie";
  }
}

function axisDataKey(abscisseType: string): keyof StatistiquesRow {
  switch (abscisseType) {
    case "date":
      return "periode";
    case "type_acte":
      return "nomActe";
    case "tranche_prix":
      return "tranchePrix";
    case "type_assurance":
      return "typeAssurance";
    case "statut_paiement":
      return "statutPaiement";
    case "jour_semaine":
      return "jourSemaine";
    default:
      return "nomActe";
  }
}

function yDomain(rows: StatistiquesRow[], yKey: "nombreActes" | "totalArgentRecu"): [number, number] {
  if (!rows.length) return [0, 1.25];
  const maxValue = Math.max(
    ...rows.map((item) => {
      const v = item[yKey];
      return typeof v === "number" ? v : 0;
    })
  );
  if (maxValue === 0) return [0, 1.25];
  const domainMax = maxValue === 1 ? 1.25 : maxValue * 1.25;
  return [0, domainMax];
}

function StatTooltip(props: { active?: boolean; payload?: Array<{ payload?: unknown; name?: unknown; value?: unknown; color?: string }>; abscisseType: string }) {
  const { active, payload, abscisseType } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as StatistiquesRow | undefined;
  if (!row) return null;
  const dk = axisDataKey(abscisseType) as string;
  const raw = row[dk];
  const formatted = typeof raw === "string" ? upperLow(raw) : String(raw ?? "");

  return (
    <div className="custom-tooltip bg-white m-5">
      <b className="label">{`${formatted}:`}</b>
      {payload.map((entry: { name?: unknown; value?: unknown; color?: string }, index: number) => {
        let labelText = "Valeur";
        const n = String(entry.name ?? "");
        if (n.includes("nombreActes") || n === "Quantité (nombreActes)") labelText = "Quantité";
        else if (n.includes("totalArgentRecu") || n.includes("Prix (totalArgentRecu)")) labelText = "Prix Total";
        else if (n.includes("totalPrixActe")) labelText = "Prix Estimé";
        return (
          <p key={index} style={{ color: entry.color }}>
            {labelText} : {Math.round(Number(entry.value) || 0)}
          </p>
        );
      })}
    </div>
  );
}

function useThemeColors() {
  const { themeNumber } = useTheme();
  return themes[themeNumber];
}

export function StatistiquesActesView({ tabId, pays }: StatistiquesActesViewProps) {
  const t = useThemeColors();
  const stats = useStatistiquesActes(pays, tabId);

  const rows = stats.statsRows;
  const xLabel = axisLabel(stats.abscisseType);
  const xKey = axisDataKey(stats.abscisseType) as string;
  const yLabel =
    stats.yAxisKey === "totalArgentRecu" ? "Prix (totalArgentRecu)" : "Quantité (nombreActes)";
  const yDomainVal = useMemo(() => yDomain(rows, stats.yAxisKey), [rows, stats.yAxisKey]);

  const totals = useMemo(() => {
    let totalQuantite = 0;
    let totalPrix = 0;
    let totalEstime = 0;
    for (const item of rows) {
      totalQuantite += Number(item.nombreActes) || 0;
      totalPrix += Number(item.totalArgentRecu) || 0;
      totalEstime += Number(item.totalPrixActe) || 0;
    }
    return { totalQuantite, totalPrix, totalEstime };
  }, [rows]);

  const selectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 6,
    border: `2px solid ${t.primary}`,
    backgroundColor: t.secondary,
    color: t.primary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  };

  const fieldLabel: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: t.primary,
  };

  const showDates = stats.chartType !== "secteur";

  const tableBlock = useMemo(() => {
    const hasActeNames = rows.some((d) => d.nomActe && d.nomActe !== "");
    const columns = hasActeNames
      ? [xLabel, "Nom de l'acte", "Quantité", "Prix Total"]
      : [xLabel, "Quantité", "Prix Total"];
    const data = rows.map((row) => {
      const cat = row[xKey];
      const base: Record<string, string | number> = {
        [xLabel]: upperLow(String(cat ?? "N/A")),
        Quantité: Math.round(row.nombreActes ?? 0),
        "Prix Total": Math.round(row.totalArgentRecu ?? 0),
      };
      if (hasActeNames) {
        base["Nom de l'acte"] = upperLow(row.nomActe || "N/A");
      }
      return base;
    });
    return { columns, data };
  }, [rows, xKey, xLabel]);

  const renderChart = () => {
    switch (stats.chartType) {
      case "bar":
        return (
          <BarChart data={rows} barSize="12%" style={{ backgroundColor: t.secondary }}>
            <CartesianGrid strokeDasharray="3 4" stroke={t.primary} />
            <XAxis
              dataKey={xKey}
              stroke={t.primary}
              label={{ value: xLabel, position: "insideBottom", offset: -5, fill: t.primary }}
            />
            <YAxis
              label={{ value: yLabel, angle: -90, position: "insideLeft", fill: t.primary }}
              stroke={t.primary}
              domain={yDomainVal}
            />
            <Tooltip content={(p) => <StatTooltip {...p} abscisseType={stats.abscisseType} />} />
            <Legend />
            <Bar dataKey={stats.yAxisKey} name={yLabel} fill={t.primary} />
          </BarChart>
        );
      case "line":
        return (
          <LineChart data={rows} style={{ backgroundColor: t.secondary }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.primary} />
            <XAxis
              dataKey={xKey}
              stroke={t.primary}
              label={{ value: xLabel, position: "insideBottom", offset: -5, fill: t.primary }}
            />
            <YAxis
              label={{ value: yLabel, angle: -90, position: "insideLeft", fill: t.primary }}
              stroke={t.primary}
              domain={yDomainVal}
            />
            <Tooltip content={(p) => <StatTooltip {...p} abscisseType={stats.abscisseType} />} />
            <Legend />
            <Line type="monotone" dataKey={stats.yAxisKey} name={yLabel} stroke={t.primary} />
          </LineChart>
        );
      case "area":
        return (
          <AreaChart data={rows} style={{ backgroundColor: t.secondary }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.primary} />
            <XAxis
              dataKey={xKey}
              stroke={t.primary}
              label={{ value: xLabel, position: "insideBottom", offset: -5, fill: t.primary }}
            />
            <YAxis
              label={{ value: yLabel, angle: -90, position: "insideLeft", fill: t.primary }}
              stroke={t.primary}
              domain={yDomainVal}
            />
            <Tooltip content={(p) => <StatTooltip {...p} abscisseType={stats.abscisseType} />} />
            <Legend />
            <Area
              type="monotone"
              dataKey={stats.yAxisKey}
              name={yLabel}
              stroke={t.primary}
              fill={t.primary}
            />
          </AreaChart>
        );
      case "secteur":
        return (
          <PieChart style={{ backgroundColor: t.secondary }}>
            <Pie
              data={rows}
              dataKey={stats.yAxisKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {rows.map((_, index) => (
                <Cell key={`cell-${index}`} fill={t.primary} />
              ))}
            </Pie>
            <Tooltip content={(p) => <StatTooltip {...p} abscisseType={stats.abscisseType} />} />
            <Legend />
          </PieChart>
        );
      default:
        return <div style={{ color: t.primary }}>Sélectionnez un type de graphique.</div>;
    }
  };

  return (
    <div className="statistiques-actes-view">
      <header
        style={{
          backgroundColor: t.primary,
          color: t.secondary,
          padding: "1.25rem",
          borderRadius: 12,
          marginBottom: "1.25rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Statistiques des actes</h1>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", opacity: 0.95 }}>
          Période, regroupements, filtres et visualisations
        </p>
      </header>

      <section
        style={{
          backgroundColor: t.secondary,
          padding: "1.25rem",
          borderRadius: 12,
          marginBottom: "1.25rem",
          border: `2px solid ${t.primary}15`,
        }}
      >
        <h2 style={{ fontSize: "1rem", marginTop: 0, color: t.primary }}>Paramètres</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          {showDates && (
            <>
              <label style={fieldLabel}>
                <span>
                  Date de début <span style={{ color: "#dc3545" }}>*</span>
                </span>
                <Input
                  type="date"
                  value={stats.dateDebut}
                  onChange={(e) => stats.setDateDebut(e.target.value)}
                  style={{
                    ...selectStyle,
                    border: !stats.dateDebut ? "2px solid #dc3545" : selectStyle.border,
                  }}
                  max={stats.dateFin || stats.maxDateStr}
                />
              </label>
              <label style={fieldLabel}>
                <span>
                  Date de fin <span style={{ color: "#dc3545" }}>*</span>
                </span>
                <Input
                  type="date"
                  value={stats.dateFin}
                  onChange={(e) => stats.setDateFin(e.target.value)}
                  style={{
                    ...selectStyle,
                    border:
                      !stats.dateFin || (stats.dateDebut && stats.dateFin < stats.dateDebut)
                        ? "2px solid #dc3545"
                        : selectStyle.border,
                  }}
                  min={stats.dateDebut}
                  max={stats.maxDateStr}
                />
              </label>
            </>
          )}

          {showDates && stats.datesValides && (
            <label style={fieldLabel}>
              <span>Axe horizontal (X)</span>
              <select
                value={stats.abscisseType}
                onChange={(e) => stats.setAbscisseType(e.target.value)}
                style={selectStyle}
              >
                <option value="" disabled>
                  — Choisir —
                </option>
                <option value="date">Par date</option>
                <option value="type_acte">Par type d&apos;acte</option>
                <option value="jour_semaine">Par jour de la semaine</option>
                <option value="type_assurance">Par type d&apos;assurance</option>
                <option value="statut_paiement">Par statut de paiement</option>
                <option value="tranche_prix">Par tranche de prix</option>
              </select>
            </label>
          )}

          {stats.abscisseType === "date" && showDates && stats.datesValides && (
            <label style={fieldLabel}>
              <span>Grouper par</span>
              <select
                value={stats.groupByPeriod}
                onChange={(e) => stats.setGroupByPeriod(e.target.value)}
                style={selectStyle}
              >
                <option value="jour">Jour</option>
                <option value="semaine">Semaine</option>
                <option value="mois">Mois</option>
                <option value="annee">Année</option>
              </select>
            </label>
          )}

          {stats.abscisseType === "type_acte" && showDates && stats.datesValides && (
            <div style={{ ...fieldLabel, gridColumn: "1 / -1" }}>
              <StatistiquesFiltreActes
                noms={stats.nomsCatalogue}
                selection={stats.filtreNomsActes}
                loading={stats.loadingNoms}
                onToggle={stats.toggleFiltreNom}
                onClear={stats.clearFiltreNoms}
                primaryColor={t.primary}
                secondaryColor={t.secondary}
              />
            </div>
          )}

          {showDates && stats.axeXSelectionne && (
            <label style={fieldLabel}>
              <span>Axe vertical (Y)</span>
              <select
                value={stats.yAxisKey}
                onChange={(e) =>
                  stats.setYAxisKey(e.target.value as "nombreActes" | "totalArgentRecu")
                }
                style={selectStyle}
              >
                <option value="nombreActes">Quantité d&apos;actes</option>
                <option value="totalArgentRecu">Prix total (FCFA)</option>
              </select>
            </label>
          )}

          {stats.axeXSelectionne && (
            <label style={fieldLabel}>
              <span>Type de graphique</span>
              <select
                value={stats.chartType}
                onChange={(e) => stats.setChartType(e.target.value)}
                style={selectStyle}
              >
                <option value="bar">Barres</option>
                <option value="line">Lignes</option>
                <option value="area">Aires</option>
                <option value="secteur">Secteur</option>
                <option value="tableau">Tableau</option>
              </select>
            </label>
          )}
        </div>
      </section>

      {stats.chartType === "tableau" ? (
        <section style={{ marginBottom: "1.25rem", position: "relative" }}>
          {stats.loadingStats && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `${t.secondary}cc`,
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                color: t.primary,
                borderRadius: 12,
              }}
            >
              Chargement…
            </div>
          )}
          <Tables
            itmsPerPage={12}
            tableContent={{ columns: tableBlock.columns, data: tableBlock.data }}
            onRowClick={() => {}}
            setLimit={() => {}}
            color={t.primary}
            backgroundColor={t.secondary}
          />
        </section>
      ) : !stats.datesValides ? (
        <section
          style={{
            padding: "2.5rem",
            textAlign: "center",
            backgroundColor: t.secondary,
            borderRadius: 12,
            color: t.primary,
            border: `3px solid ${t.primary}`,
          }}
        >
          <p style={{ fontSize: "1.125rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Dates requises
          </p>
          <p style={{ fontSize: "0.875rem", opacity: 0.9 }}>
            Indiquez une date de début et une date de fin valides.
          </p>
        </section>
      ) : (
        <section
          style={{
            width: "100%",
            minWidth: 280,
            minHeight: 420,
            borderRadius: 12,
            backgroundColor: t.secondary,
            color: t.primary,
            position: "relative",
            marginBottom: "1.25rem",
          }}
        >
          {stats.loadingStats && rows.length === 0 && (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Chargement des données…
            </div>
          )}
          {!stats.loadingStats && rows.length === 0 && (
            <div style={{ padding: "2.5rem", textAlign: "center" }}>
              <p style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Aucune donnée</p>
              <p style={{ fontSize: "0.875rem", opacity: 0.75 }}>
                {stats.filtreNomsActes.length > 0
                  ? "Rien pour ce filtre — ajustez les types cochés ou la période."
                  : "Aucun acte sur cette période."}
              </p>
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ width: "100%", height: 420 }}>
              {stats.loadingStats && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 12,
                    zIndex: 2,
                    fontSize: 12,
                    fontWeight: 600,
                    color: t.primary,
                    opacity: 0.85,
                  }}
                >
                  Mise à jour…
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%" key={stats.rechartsMountKey}>
                {renderChart()}
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        {[
          { title: "Total quantité", value: Math.round(totals.totalQuantite), unit: "actes" },
          {
            title: "Total payé",
            value: Math.round(totals.totalPrix).toLocaleString("fr-FR"),
            unit: "FCFA",
          },
          {
            title: "Total estimé",
            value: Math.round(totals.totalEstime).toLocaleString("fr-FR"),
            unit: "FCFA",
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              backgroundColor: t.secondary,
              padding: "1.25rem",
              borderRadius: 12,
              border: `3px solid ${t.primary}`,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                color: t.primary,
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {card.title}
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: t.primary }}>{card.value}</div>
            <div style={{ fontSize: "0.75rem", color: t.primary, marginTop: 4, opacity: 0.7 }}>
              {card.unit}
            </div>
          </div>
        ))}
      </section>

      <section
        style={{
          backgroundColor: t.secondary,
          padding: "1.25rem",
          borderRadius: 12,
          border: `2px solid ${t.primary}15`,
        }}
      >
        <h2
          style={{
            color: t.primary,
            marginTop: 0,
            marginBottom: "1.25rem",
            fontSize: "1.25rem",
            fontWeight: 700,
            borderBottom: `2px solid ${t.primary}15`,
            paddingBottom: "0.5rem",
          }}
        >
          Détail par ligne
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((row, index) => {
            const label = row[xKey] ?? "N/A";
            return (
              <article
                key={`${String(label)}-${index}`}
                style={{
                  backgroundColor: t.tertiary,
                  padding: "1rem",
                  borderRadius: 8,
                  border: `1px solid ${t.primary}10`,
                  boxShadow: `0 2px 4px ${t.shadowViolet}`,
                }}
              >
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: t.primary,
                    marginBottom: 10,
                  }}
                >
                  {upperLow(String(label))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 10,
                    fontSize: "0.8125rem",
                  }}
                >
                  <div>
                    <span style={{ color: t.primary, opacity: 0.7 }}>Quantité</span>
                    <div style={{ fontWeight: 600, color: t.primary, marginTop: 2 }}>
                      {Math.round(Number(row.nombreActes) || 0)} actes
                    </div>
                  </div>
                  <div>
                    <span style={{ color: t.primary, opacity: 0.7 }}>Prix payé</span>
                    <div style={{ fontWeight: 600, color: t.primary, marginTop: 2 }}>
                      {Math.round(row.totalArgentRecu ?? 0).toLocaleString("fr-FR")} FCFA
                    </div>
                  </div>
                  <div>
                    <span style={{ color: t.primary, opacity: 0.7 }}>Prix estimé</span>
                    <div style={{ fontWeight: 600, color: t.primary, marginTop: 2 }}>
                      {Math.round(Number(row.totalPrixActe) || 0).toLocaleString("fr-FR")} FCFA
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default StatistiquesActesView;
