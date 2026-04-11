import { YellowFrame } from '../components/YellowFrame.js';
import { mockActes } from '../data/mockData.js';

/** Page actes prioritaire : tableau, modal nouvel acte, badge statut, total */
export function SceneActes() {
  return (
    <div className="pub-scene pub-scene-actes">
      <YellowFrame large>
        <div className="pub-actes">
          <div className="pub-actes__head">
            <h2 className="pub-actes__title">Actes</h2>
            <button type="button" className="pub-actes__add">
              + Nouvel acte
            </button>
          </div>
          <div className="pub-actes__layout">
            <div className="pub-actes__modal" aria-hidden>
              <div className="pub-actes__modal-title">Nouvel acte</div>
              <div className="pub-actes__modal-fields">
                <div className="pub-actes__field" />
                <div className="pub-actes__field" />
                <div className="pub-actes__field pub-actes__field--short" />
              </div>
              <div className="pub-actes__modal-actions">
                <span className="pub-actes__ghost">Annuler</span>
                <span className="pub-actes__ok">Enregistrer</span>
              </div>
            </div>
            <table className="pub-actes__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Acte</th>
                  <th>Praticien</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Progression</th>
                </tr>
              </thead>
              <tbody>
                {mockActes.map((a) => (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td>{a.patient}</td>
                    <td>{a.acte}</td>
                    <td>{a.praticien}</td>
                    <td>{a.montant}</td>
                    <td>
                      <span
                        className={`pub-actes__badge pub-actes__badge--${a.statut === 'En cours' ? 'progress' : 'ok'}`}
                      >
                        {a.statut}
                      </span>
                    </td>
                    <td>
                      <div className="pub-actes__prog">
                        <i style={{ width: `${a.progression}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="pub-actes__row--new">
                  <td>28/03/2026</td>
                  <td>Ibrahima Sarr</td>
                  <td>Visite de contrôle</td>
                  <td>Dr. Kane</td>
                  <td>18 000 F</td>
                  <td>
                    <span className="pub-actes__badge pub-actes__badge--progress">
                      En cours
                    </span>
                  </td>
                  <td>
                    <div className="pub-actes__prog">
                      <i style={{ width: '35%' }} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <aside className="pub-actes__side">
              <h3>Résumé du jour</h3>
              <p className="pub-actes__total">
                <span>Total encours</span>
                <strong className="pub-actes__total-num">103 000 F</strong>
              </p>
              <p className="pub-muted">Mis à jour automatiquement à chaque acte.</p>
            </aside>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
