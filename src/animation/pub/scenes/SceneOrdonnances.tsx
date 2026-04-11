import { YellowFrame } from '../components/YellowFrame.js';
import { mockOrdonnanceLines } from '../data/mockData.js';

/** Ordonnances : liste, édition, aperçu document, PDF */
export function SceneOrdonnances() {
  return (
    <div className="pub-scene pub-scene-ordo">
      <YellowFrame large>
        <div className="pub-ordo">
          <div className="pub-ordo__left">
            <div className="pub-ordo__head">
              <h2>Ordonnances</h2>
              <button type="button" className="pub-ordo__new">
                Nouvelle ordonnance
              </button>
            </div>
            <ul className="pub-ordo__list">
              <li>ORD-2026-031 · Sophie Martin · 28/03</li>
              <li>ORD-2026-028 · Amadou Diallo · 26/03</li>
              <li className="pub-ordo__list--ghost">Brouillon en cours…</li>
            </ul>
            <div className="pub-ordo__editor">
              <div className="pub-ordo__field">
                <label>Patient</label>
                <div className="pub-ordo__input pub-ordo__input--fill">
                  Sophie Martin
                </div>
              </div>
              {mockOrdonnanceLines.map((l) => (
                <div key={l.med} className="pub-ordo__rx">
                  <span className="pub-ordo__med">{l.med}</span>
                  <span className="pub-ordo__poso">
                    {l.poso} · {l.duree}
                  </span>
                </div>
              ))}
              <div className="pub-ordo__sign">
                <span>Signature / validation</span>
                <div className="pub-ordo__sign-line" />
              </div>
            </div>
          </div>
          <div className="pub-ordo__preview">
            <div className="pub-ordo__paper">
              <header>
                <strong>Cabinet médical</strong>
                <span>Ordonnance</span>
              </header>
              <p>Patient : Sophie Martin · 42 ans</p>
              <ul>
                {mockOrdonnanceLines.map((l) => (
                  <li key={l.med}>
                    {l.med} — {l.poso} ({l.duree})
                  </li>
                ))}
              </ul>
              <footer>Dr. A. Kane — 28/03/2026</footer>
            </div>
            <div className="pub-ordo__actions">
              <button type="button" className="pub-ordo__pdf">
                Exporter PDF
              </button>
              <button type="button" className="pub-ordo__print">
                Imprimer
              </button>
            </div>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
