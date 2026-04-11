import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { PubMarketingBar } from './components/PubMarketingBar.js';
import { SceneImageSlide } from './components/SceneImageSlide.js';
import {
  colors,
  defaults,
  PUB_TRANSITION_MS,
} from './config/pub.config.js';
import { getApkImagesSorted } from './data/apkImages.js';
import { usePubTimeline } from './hooks/usePubTimeline.js';
import { buildPubSlides, type PubSlideDef } from './slides/buildPubSlides.js';
import { SceneSplash } from './scenes/SceneSplash.js';

function slideNode(slide: PubSlideDef | undefined): ReactNode {
  if (!slide) return null;
  switch (slide.type) {
    case 'splash-open':
      return <SceneSplash mode="opening" />;
    case 'splash-close':
      return <SceneSplash mode="ending" />;
    case 'image':
      return (
        <SceneImageSlide
          src={slide.src}
          fileName={slide.fileName}
          animLot={slide.animLot}
          durationMs={slide.durationMs}
        />
      );
    case 'placeholder':
      return (
        <SceneImageSlide
          animLot={slide.animLot}
          durationMs={slide.durationMs}
          emptyMessage={slide.marketing?.headline}
          emptySublines={slide.marketing?.sublines}
        />
      );
    default:
      return null;
  }
}

function readLoopFromUrl(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('loop') === '1';
  } catch {
    return false;
  }
}

export function PubAnimation() {
  const [loop, setLoop] = useState(() => defaults.loop || readLoopFromUrl());
  const [finished, setFinished] = useState(false);

  const apkImages = useMemo(() => getApkImagesSorted(), []);
  const slides = useMemo(() => buildPubSlides(apkImages), [apkImages]);

  const sceneIds = useMemo(() => slides.map((s) => s.key), [slides]);
  const durationsMs = useMemo(() => slides.map((s) => s.durationMs), [slides]);

  const onComplete = useCallback(() => setFinished(true), []);

  const { sceneIndex, sceneId, phase, globalProgress, restart } = usePubTimeline({
    sceneIds,
    durationsMs,
    loop,
    transitionMs: PUB_TRANSITION_MS,
    onComplete,
  });

  const currentSlide = slides[sceneIndex];
  const marketingCopy = currentSlide?.marketing ?? null;

  const cssVars = {
    '--pub-bg': colors.background,
    '--pub-bg-deep': colors.backgroundDeep,
    '--pub-frame': colors.frame,
    '--pub-frame-border': colors.frameBorder,
    '--pub-frame-inner': colors.frameInner,
    '--pub-accent': colors.accent,
    '--pub-accent-light': colors.accentLight,
    '--pub-text': colors.textOnDark,
    '--pub-muted': colors.textMuted,
    '--pub-mock-surface': colors.mockSurface,
    '--pub-mock-border': colors.mockBorder,
    '--pub-trans': `${PUB_TRANSITION_MS}ms`,
  } as CSSProperties;

  return (
    <div className="pub-root" style={cssVars}>
      <div className="pub-root__glow" aria-hidden />

      {currentSlide?.type !== 'splash-open' && currentSlide?.type !== 'splash-close' && (
        <PubMarketingBar copy={marketingCopy} />
      )}

      <div className={`pub-stage pub-stage--phase-${phase}`}>
        <div key={`${sceneIndex}-${sceneId}`} className="pub-stage__inner">
          {slideNode(currentSlide)}
        </div>
      </div>

      {defaults.showControls && (
        <div className="pub-controls">
          <progress
            className="pub-controls__progress"
            max={1}
            value={finished && !loop ? 1 : globalProgress}
            aria-label="Progression de la publicité"
          />
          <span className="pub-controls__meta" title="Diapositives">
            {sceneIndex + 1} / {slides.length}
          </span>
          <label className="pub-controls__loop">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => {
                setLoop(e.target.checked);
                setFinished(false);
                restart();
              }}
            />
            Lecture en boucle
          </label>
          {finished && !loop && (
            <button
              type="button"
              className="pub-controls__replay"
              onClick={() => {
                setFinished(false);
                restart();
              }}
            >
              Revoir depuis le début
            </button>
          )}
        </div>
      )}
    </div>
  );
}
