import { YellowFrame } from '../components/YellowFrame.js';

/** Mosaïque des 5 modules forts */
export function SceneMosaic() {
  const cells = [
    { label: 'Patients', cls: 'pub-mosaic__cell--patients' },
    { label: 'Actes', cls: 'pub-mosaic__cell--actes' },
    { label: 'Ordonnances', cls: 'pub-mosaic__cell--ordo' },
    { label: 'États', cls: 'pub-mosaic__cell--etats' },
    { label: 'Statistiques', cls: 'pub-mosaic__cell--stats' },
  ];
  return (
    <div className="pub-scene pub-scene-mosaic">
      <div className="pub-mosaic">
        {cells.map((c) => (
          <YellowFrame key={c.label} className={`pub-mosaic__wrap ${c.cls}`}>
            <div className="pub-mosaic__inner">
              <span>{c.label}</span>
            </div>
          </YellowFrame>
        ))}
      </div>
    </div>
  );
}
