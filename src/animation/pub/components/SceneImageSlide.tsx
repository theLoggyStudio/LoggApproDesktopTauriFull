import type { CSSProperties } from 'react';
import { SLIDE_ANIM_LOT_COUNT } from '../config/pub.config.js';
import { YellowFrame } from './YellowFrame.js';

interface SceneImageSlideProps {
  src?: string;
  fileName?: string;
  animLot: number;
  durationMs: number;
  /** Diapositive sans fichier (dossier apkImg vide) */
  emptyMessage?: string;
  emptySublines?: string[];
}

/**
 * Capture dans le cadre jaune + légende fichier.
 * Variantes d’animation : classes `--lot-0` … `--lot-${SLIDE_ANIM_LOT_COUNT-1}`.
 */
export function SceneImageSlide({
  src,
  fileName,
  animLot,
  durationMs,
  emptyMessage,
  emptySublines,
}: SceneImageSlideProps) {
  const lot = ((animLot % SLIDE_ANIM_LOT_COUNT) + SLIDE_ANIM_LOT_COUNT) % SLIDE_ANIM_LOT_COUNT;
  const style = {
    '--pub-img-anim-ms': `${Math.max(durationMs, 2500)}ms`,
  } as CSSProperties;

  return (
    <div className="pub-img-slide" style={style}>
      <YellowFrame large className="pub-img-slide__frame">
        <div className="pub-img-slide__inner">
          {src ? (
            <div className={`pub-img-slide__viewport pub-img-slide__viewport--lot-${lot}`}>
              <img src={src} alt="" className="pub-img-slide__img" decoding="async" />
            </div>
          ) : (
            <div className="pub-img-slide__placeholder">
              <p>{emptyMessage ?? 'Aucune image'}</p>
              {emptySublines?.map((line) => (
                <p key={line} className="pub-img-slide__placeholder-sub">
                  {line}
                </p>
              ))}
            </div>
          )}
          {fileName ? <div className="pub-img-slide__caption">{fileName}</div> : null}
        </div>
      </YellowFrame>
    </div>
  );
}
