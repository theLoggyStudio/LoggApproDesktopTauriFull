/**
 * Scène d’ouverture / de clôture : reprend l’esprit du splash index.html
 * (logo, lettres animées jaune → violet) + zone type PageOuverture / connexion (maquette statique, sans Tauri).
 */
import logoUrl from '../../../assets/logo.png';
import { colors, marketingCopy } from '../config/pub.config.js';

type Mode = 'opening' | 'ending';

const LETTERS = ['L', 'o', 'g', 'g', 'P', 'a', 't', 'i', 'e', 'n', 't'];

export function SceneSplash({ mode }: { mode: Mode }) {
  const copy = mode === 'ending' ? marketingCopy.ending : marketingCopy.opening;
  const baseDelay = 2; // s — aligné sur le splash HTML

  return (
    <div className={`pub-splash pub-splash--${mode}`}>
      <div className="pub-splash__hero">
        <img
          src={logoUrl}
          alt=""
          className="pub-splash__logo"
          width={280}
          height={280}
        />
        <div className="pub-splash__title" aria-hidden>
          {LETTERS.map((ch, i) => (
            <span
              key={`${mode}-${i}`}
              className="pub-splash__letter"
              style={{ animationDelay: `${baseDelay + i * 0.18}s` }}
            >
              <span>{ch}</span>
            </span>
          ))}
        </div>
        <div className="pub-splash__taglines">
          {/* En ouverture le titre animé remplace le headline « LoggAppro » du fichier de config */}
          {(mode === 'ending' || copy.headline !== 'LoggAppro') && (
            <p className="pub-splash__line pub-splash__line--1">{copy.headline}</p>
          )}
          {copy.sublines.map((s) => (
            <p key={s} className="pub-splash__line">
              {s}
            </p>
          ))}
        </div>
      </div>

      {/* Maquette type barre violette + encart connexion (sans logique métier) */}
      <div
        className="pub-splash__connection-strip"
        style={{ backgroundColor: colors.accent, color: colors.frame }}
      >
        <div className="pub-splash__connection-card">
          <div className="pub-splash__mock-form">
            <span className="pub-splash__mock-label">Identifiant ou téléphone</span>
            <div className="pub-splash__mock-input" />
            <span className="pub-splash__mock-label">Mot de passe</span>
            <div className="pub-splash__mock-input pub-splash__mock-input--pwd" />
            <div className="pub-splash__mock-btn">Connexion sécurisée</div>
          </div>
        </div>
      </div>
    </div>
  );
}
