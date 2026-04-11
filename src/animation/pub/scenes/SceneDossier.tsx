import { YellowFrame } from '../components/YellowFrame.js';

/** Dossier patient : continuité après la liste */
export function SceneDossier() {
  const tabs = ['Résumé', 'Historique', 'Actes', 'Documents', 'Finance'];
  return (
    <div className="pub-scene pub-scene-dossier">
      <YellowFrame>
        <div className="pub-dossier">
          <header className="pub-dossier__header">
            <div className="pub-dossier__avatar">SM</div>
            <div>
              <h2 className="pub-dossier__name">Sophie Martin</h2>
              <p className="pub-muted">42 ans · F · N° dossier 2026-1842</p>
            </div>
            <span className="pub-dossier__pill">Actif</span>
          </header>
          <nav className="pub-dossier__tabs">
            {tabs.map((t, i) => (
              <span
                key={t}
                className={`pub-dossier__tab ${i === 1 ? 'pub-dossier__tab--on' : ''}`}
              >
                {t}
              </span>
            ))}
          </nav>
          <div className="pub-dossier__grid">
            <section className="pub-dossier__timeline">
              <h3>Historique</h3>
              <ul>
                <li>
                  <time>28/03</time>
                  <span>Consultation — Dr. Kane</span>
                </li>
                <li>
                  <time>12/02</time>
                  <span>Analyses biologiques</span>
                </li>
                <li>
                  <time>05/01</time>
                  <span>Vaccination rappel</span>
                </li>
              </ul>
            </section>
            <section className="pub-dossier__cards">
              <div className="pub-dossier__card">
                <span>Observations</span>
                <p>Suivi tension stable. Prochain contrôle dans 3 mois.</p>
              </div>
              <div className="pub-dossier__card">
                <span>Résumé financier</span>
                <p>
                  <strong>48 500 F</strong> facturés · <strong>45 000 F</strong> encaissés
                </p>
              </div>
            </section>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
