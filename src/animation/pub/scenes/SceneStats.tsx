import { useState, useEffect } from 'react';
import { YellowFrame } from '../components/YellowFrame.js';
import { mockChartWeeks, mockKpis } from '../data/mockData.js';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber.js';

/** Statistiques : KPI, courbes, histogrammes, filtre période */
export function SceneStats() {
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  useEffect(() => {
    const t = setTimeout(() => setPeriod('week'), 11_000);
    return () => clearTimeout(t);
  }, []);

  const nPatients = useAnimatedNumber(mockKpis[0]!.value, 2_200, 0, true);
  const nActes = useAnimatedNumber(mockKpis[1]!.value, 2_400, 0, true);
  const nRev = useAnimatedNumber(mockKpis[2]!.value, 2_600, 1, true);

  const values = [nPatients, nActes, `${nRev}${mockKpis[2]!.suffix}`];

  return (
    <div className="pub-scene pub-scene-stats">
      <YellowFrame large>
        <div className="pub-stats">
          <div className="pub-stats__filters">
            <span>Période</span>
            <button
              type="button"
              className={period === 'month' ? 'pub-stats__f--on' : ''}
            >
              Mois
            </button>
            <button
              type="button"
              className={period === 'week' ? 'pub-stats__f--on' : ''}
            >
              Semaine
            </button>
          </div>
          <div className="pub-stats__kpis">
            {mockKpis.map((k, i) => (
              <div key={k.label} className="pub-stats__kpi">
                <span>{k.label}</span>
                <strong>{values[i]}</strong>
              </div>
            ))}
          </div>
          <div className="pub-stats__charts">
            <div className="pub-stats__line-card">
              <h3>Évolution des actes</h3>
              <div className="pub-stats__line">
                <svg viewBox="0 0 200 80" preserveAspectRatio="none">
                  <path
                    className="pub-stats__line-path"
                    d="M0,60 L50,40 L100,50 L150,25 L200,35"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
            <div className="pub-stats__bar-card">
              <h3>Répartition hebdomadaire</h3>
              <div className="pub-stats__bars">
                {mockChartWeeks.map((w) => (
                  <div key={w.label} className="pub-stats__bar">
                    <i style={{ height: `${w.v}%` }} />
                    <span>{w.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
