import { useCallback, useEffect, useRef, useState } from 'react';
import { PUB_TRANSITION_MS } from '../config/pub.config.js';

export type TransitionPhase = 'in' | 'hold' | 'out';

interface UsePubTimelineOptions {
  /** Clés de diapositives (ex. splash-opening, img-0-…), pas les SceneId marketing */
  sceneIds: string[];
  durationsMs: number[];
  loop: boolean;
  transitionMs?: number;
  onComplete?: () => void;
}

interface UsePubTimelineResult {
  sceneIndex: number;
  /** Clé de la diapositive courante (ex. splash-opening, img-0-01.png) */
  sceneId: string;
  phase: TransitionPhase;
  /** Progression globale 0–1 sur la durée totale */
  globalProgress: number;
  restart: () => void;
}

/**
 * Pilote l’enchaînement automatique des scènes avec phases entrée / maintien / sortie
 * pour permettre les transitions CSS (fade, blur, léger zoom).
 */
export function usePubTimeline({
  sceneIds,
  durationsMs,
  loop,
  transitionMs = PUB_TRANSITION_MS,
  onComplete,
}: UsePubTimelineOptions): UsePubTimelineResult {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [phase, setPhase] = useState<TransitionPhase>('in');
  const [globalProgress, setGlobalProgress] = useState(0);

  const totalDuration = durationsMs.reduce((a, b) => a + b, 0);
  const startRef = useRef<number>(Date.now());
  const rafRef = useRef<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const restart = useCallback(() => {
    clearTimers();
    startRef.current = Date.now();
    setSceneIndex(0);
    setPhase('in');
    setGlobalProgress(0);
    setEpoch((e) => e + 1);
  }, [clearTimers]);

  useEffect(() => {
    clearTimers();
    const duration = durationsMs[sceneIndex] ?? 8_000;
    const outStart = Math.max(duration - transitionMs, transitionMs * 0.5);

    setPhase('in');
    const tIn = setTimeout(() => setPhase('hold'), transitionMs);
    const tOut = setTimeout(() => setPhase('out'), outStart);
    const tNext = setTimeout(() => {
      const next = sceneIndex + 1;
      if (next >= sceneIds.length) {
        if (loop) {
          startRef.current = Date.now();
          setGlobalProgress(0);
          setSceneIndex(0);
          setPhase('in');
        } else {
          onComplete?.();
          setPhase('hold');
        }
      } else {
        setSceneIndex(next);
        setPhase('in');
      }
    }, duration);

    timersRef.current.push(tIn, tOut, tNext);

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      setGlobalProgress(Math.min(1, elapsed / totalDuration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return clearTimers;
  }, [
    sceneIndex,
    epoch,
    sceneIds.length,
    durationsMs,
    loop,
    transitionMs,
    onComplete,
    clearTimers,
    totalDuration,
  ]);

  return {
    sceneIndex,
    sceneId: sceneIds[sceneIndex]!,
    phase,
    globalProgress,
    restart,
  };
}
