import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageStatistiqueController } from "../controllers/PageStatistiqueController.js";

/** Ligne renvoyée par stats_get_info (champs variables selon l’axe X). */
export interface StatistiquesRow {
  nombreActes?: number;
  totalArgentRecu?: number;
  totalPrixActe?: number;
  nomActe?: string;
  periode?: string;
  tranchePrix?: string;
  typeAssurance?: string;
  statutPaiement?: string;
  jourSemaine?: string;
  name?: string;
  [key: string]: unknown;
}

/** Même forme Unicode que côté Rust/SQLite (évite coches « décochées » visuellement). */
function normaliserCleNom(s: string): string {
  return s.normalize("NFC").trim();
}

function normaliserListeNomsApi(raw: unknown[]): string[] {
  const set = new Set<string>();
  for (const item of raw) {
    const n =
      typeof item === "string"
        ? item
        : String((item as { nom?: string; name?: string })?.nom ?? (item as { name?: string })?.name ?? "").trim();
    const t = normaliserCleNom(n);
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

/**
 * État et chargements des statistiques actes (catalogue noms + agrégats).
 * - Le filtre par nom **n’est pas** réinitialisé quand le catalogue se recharge.
 * - Il est réinitialisé **uniquement** si la période (dates) ou le tabId change.
 * - Requêtes concurrentes ignorées via compteur (évite listes vides fantômes).
 */
export function useStatistiquesActes(pays: string, tabId: string) {
  const maxDateStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const defaultFin = maxDateStr;
  const defaultDebut = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  }, []);

  const [dateDebut, setDateDebut] = useState(defaultDebut);
  const [dateFin, setDateFin] = useState(defaultFin);

  const datesValides = Boolean(dateDebut && dateFin && dateDebut <= dateFin);

  const [abscisseType, setAbscisseType] = useState("type_acte");
  const [groupByPeriod, setGroupByPeriod] = useState("mois");
  const [chartType, setChartType] = useState("bar");
  const [yAxisKey, setYAxisKey] = useState<"nombreActes" | "totalArgentRecu">("nombreActes");

  const [nomsCatalogue, setNomsCatalogue] = useState<string[]>([]);
  const [loadingNoms, setLoadingNoms] = useState(false);

  const [statsRows, setStatsRows] = useState<StatistiquesRow[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  /** Noms cochés → envoyés tels quels au backend (filtre SQL). [] = pas de filtre. */
  const [filtreNomsActes, setFiltreNomsActes] = useState<string[]>([]);

  const periodeTabKey = `${dateDebut}|${dateFin}|${tabId}`;
  const prevPeriodeTabRef = useRef(periodeTabKey);

  useEffect(() => {
    if (prevPeriodeTabRef.current !== periodeTabKey) {
      prevPeriodeTabRef.current = periodeTabKey;
      setFiltreNomsActes([]);
    }
  }, [periodeTabKey]);

  const nomsReqId = useRef(0);
  useEffect(() => {
    if (!datesValides || !tabId) {
      setNomsCatalogue([]);
      setLoadingNoms(false);
      return;
    }
    const id = ++nomsReqId.current;
    setLoadingNoms(true);
    const ctrl = PageStatistiqueController(pays);
    void (async () => {
      try {
        const actes = await ctrl.recupererLesNomActesExistantes(dateDebut, dateFin, tabId);
        const raw = Array.isArray(actes) ? actes : [];
        const names = normaliserListeNomsApi(raw as unknown[]);
        if (nomsReqId.current === id) setNomsCatalogue(names);
      } catch {
        if (nomsReqId.current === id) setNomsCatalogue([]);
      } finally {
        if (nomsReqId.current === id) setLoadingNoms(false);
      }
    })();
  }, [pays, datesValides, dateDebut, dateFin, tabId]);

  const nomActesPourApi = useMemo(
    () => (filtreNomsActes.length > 0 ? filtreNomsActes.map((n) => normaliserCleNom(n)) : []),
    [filtreNomsActes]
  );

  const statsReqId = useRef(0);
  useEffect(() => {
    if (!datesValides || !tabId) {
      setStatsRows([]);
      setLoadingStats(false);
      return;
    }
    const id = ++statsReqId.current;
    setLoadingStats(true);
    const ctrl = PageStatistiqueController(pays);
    void (async () => {
      try {
        const detailedView = chartType === "tableau" && abscisseType === "date";
        const data = await ctrl.recupererLesStatisiquesDesActes(
          dateDebut,
          dateFin,
          nomActesPourApi,
          tabId,
          abscisseType,
          groupByPeriod,
          detailedView
        );
        if (statsReqId.current !== id) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
          setStatsRows([]);
          return;
        }
        if ((data[0] as { message?: string })?.message) {
          setStatsRows([]);
          return;
        }
        const sanitized: StatistiquesRow[] = (data as Record<string, unknown>[]).map((item) => ({
          ...item,
          nombreActes: Number(item.nombreActes) || 0,
          totalArgentRecu: Number(item.totalArgentRecu) || 0,
          totalPrixActe: Number(item.totalPrixActe) || 0,
          totalPrix: Number(item.totalPrix) || 0,
          totalEstime: Number(item.totalEstime) || 0,
          name:
            (item.nomActe as string) ||
            (item.periode as string) ||
            (item.tranchePrix as string) ||
            (item.typeAssurance as string) ||
            (item.statutPaiement as string) ||
            (item.jourSemaine as string) ||
            "N/A",
        }));
        setStatsRows(sanitized);
      } catch {
        if (statsReqId.current === id) setStatsRows([]);
      } finally {
        if (statsReqId.current === id) setLoadingStats(false);
      }
    })();
  }, [
    pays,
    datesValides,
    dateDebut,
    dateFin,
    tabId,
    nomActesPourApi,
    abscisseType,
    groupByPeriod,
    chartType,
  ]);

  const toggleFiltreNom = useCallback((nom: string) => {
    const key = normaliserCleNom(nom);
    if (!key) return;
    setFiltreNomsActes((prev) => {
      const p = prev.map((x) => normaliserCleNom(x)).filter(Boolean);
      return p.includes(key) ? p.filter((x) => x !== key) : [...p, key];
    });
  }, []);

  const clearFiltreNoms = useCallback(() => setFiltreNomsActes([]), []);

  const axeXSelectionne = datesValides && abscisseType !== "";

  const rechartsMountKey = useMemo(
    () =>
      [
        chartType,
        abscisseType,
        groupByPeriod,
        yAxisKey,
        filtreNomsActes.slice().sort().join("\u0001"),
        dateDebut,
        dateFin,
        tabId,
        statsRows.length,
      ].join("|"),
    [chartType, abscisseType, groupByPeriod, yAxisKey, filtreNomsActes, dateDebut, dateFin, tabId, statsRows.length]
  );

  return {
    maxDateStr,
    dateDebut,
    dateFin,
    setDateDebut,
    setDateFin,
    datesValides,
    abscisseType,
    setAbscisseType,
    groupByPeriod,
    setGroupByPeriod,
    chartType,
    setChartType,
    yAxisKey,
    setYAxisKey,
    nomsCatalogue,
    loadingNoms,
    filtreNomsActes,
    toggleFiltreNom,
    clearFiltreNoms,
    statsRows,
    loadingStats,
    axeXSelectionne,
    rechartsMountKey,
  };
}
