import { YellowFrame } from '../components/YellowFrame.js';

/** Documents / impression — complément rapide */
export function SceneDocuments() {
  return (
    <div className="pub-scene pub-scene-docs">
      <YellowFrame>
        <div className="pub-docs">
          <div className="pub-docs__stack">
            <div className="pub-docs__sheet pub-docs__sheet--1">
              <span>Reçu de paiement</span>
            </div>
            <div className="pub-docs__sheet pub-docs__sheet--2">
              <span>Fiche patient</span>
            </div>
            <div className="pub-docs__sheet pub-docs__sheet--3">
              <span>Export PDF</span>
            </div>
          </div>
          <div className="pub-docs__actions">
            <span className="pub-docs__printer">Impression…</span>
          </div>
        </div>
      </YellowFrame>
    </div>
  );
}
