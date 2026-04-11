import { YellowFrame } from '../components/YellowFrame.js';
import { mockPatients } from '../data/mockData.js';

/** Page patients prioritaire : recherche, filtres, tableau, panneau latéral simulé */
export function ScenePatients() {
  return (
    <div className="pub-scene pub-scene-patients">
      <YellowFrame large>
        <div className="pub-patients">
          <div className="pub-patients__toolbar">
            <div className="pub-patients__search-wrap">
              <span className="pub-patients__fake-cursor" aria-hidden />
              <div className="pub-patients__search">
                <span className="pub-patients__placeholder">Rechercher un patient…</span>
                <span className="pub-patients__typed">Martin</span>
              </div>
            </div>
            <button type="button" className="pub-patients__btn-primary">
              Nouveau patient
            </button>
          </div>
          <div className="pub-patients__filters">
            {['Nom', 'Téléphone', 'Statut', 'Dernière visite'].map((f) => (
              <span key={f} className="pub-patients__chip">
                {f}
              </span>
            ))}
          </div>
          <div className="pub-patients__body">
            <div className="pub-patients__table-wrap">
              <table className="pub-patients__table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Tél.</th>
                    <th>Âge</th>
                    <th>Sexe</th>
                    <th>Dernière visite</th>
                    <th>Prochain RDV</th>
                    <th>Statut</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mockPatients.map((p) => (
                    <tr
                      key={p.id}
                      className={p.nom === 'Martin' ? 'pub-patients__row--focus' : ''}
                    >
                      <td>
                        {p.prenom} {p.nom}
                      </td>
                      <td>{p.tel}</td>
                      <td>{p.age}</td>
                      <td>{p.sexe}</td>
                      <td>{p.derniereVisite}</td>
                      <td>{p.prochainRdv}</td>
                      <td>
                        <span className="pub-badge">{p.statut}</span>
                      </td>
                      <td>
                        <span className="pub-linkish">Dossier</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside className="pub-patients__drawer">
              <div className="pub-patients__drawer-head">
                <div className="pub-patients__avatar">SM</div>
                <div>
                  <strong>Sophie Martin</strong>
                  <div className="pub-muted">Dossier n° 2026-1842</div>
                </div>
              </div>
              <dl className="pub-patients__dl">
                <dt>Téléphone</dt>
                <dd>+221 77 312 45 89</dd>
                <dt>Prochain RDV</dt>
                <dd>02/04/2026 — 10h30</dd>
                <dt>Dernière visite</dt>
                <dd>Consultation générale</dd>
              </dl>
              <button type="button" className="pub-patients__btn-secondary">
                Ouvrir le dossier complet
              </button>
            </aside>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
