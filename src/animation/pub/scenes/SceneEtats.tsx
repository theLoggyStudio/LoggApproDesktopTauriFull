import { YellowFrame } from '../components/YellowFrame.js';

/** Création de la page des états : palette + zone de composition + aperçu */
export function SceneEtats() {
  const blocks = ['Texte', 'Tableau', 'Bloc', 'Titre', 'Variable', 'Section'];
  return (
    <div className="pub-scene pub-scene-etats">
      <YellowFrame large>
        <div className="pub-etats">
          <aside className="pub-etats__palette">
            <h3>Éléments</h3>
            <ul>
              {blocks.map((b) => (
                <li key={b} className="pub-etats__palette-item">
                  {b}
                </li>
              ))}
            </ul>
            <p className="pub-muted pub-etats__hint">
              Glissez vers la zone centrale pour composer votre état.
            </p>
          </aside>
          <div className="pub-etats__canvas-wrap">
            <div className="pub-etats__toolbar">
              <span>Page d’état — sans titre</span>
              <button type="button" className="pub-etats__preview-btn">
                Aperçu
              </button>
            </div>
            <div className="pub-etats__canvas">
              <div className="pub-etats__fly pub-etats__fly--title">
                <span>Titre du rapport</span>
              </div>
              <div className="pub-etats__fly pub-etats__fly--table">
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Acte</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>S. Martin</td>
                      <td>Consultation</td>
                      <td>25 000</td>
                    </tr>
                    <tr>
                      <td>A. Diallo</td>
                      <td>Pansement</td>
                      <td>15 000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="pub-etats__fly pub-etats__fly--stat">
                <span>Résumé</span>
                <strong>42 actes · 1,2 M F</strong>
              </div>
            </div>
          </div>
          <div className="pub-etats__final">
            <div className="pub-etats__final-inner">
              <h2>Rapport d’activité — Mars 2026</h2>
              <p className="pub-muted">Aperçu final structuré, prêt à l’export.</p>
            </div>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
