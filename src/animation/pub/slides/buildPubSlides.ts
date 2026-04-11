import {
  computePerImageSlideMs,
  marketingCopy,
  marketingRotationForImageSlides,
  SLIDE_ANIM_LOT_COUNT,
  slideTiming,
  type SceneId,
} from '../config/pub.config.js';
import type { ApkImageEntry } from '../data/apkImages.js';

export type PubSlideType = 'splash-open' | 'splash-close' | 'image' | 'placeholder';

export interface PubSlideDef {
  key: string;
  durationMs: number;
  type: PubSlideType;
  src?: string;
  fileName?: string;
  /** Variante d’animation visuelle dans le cadre (0 … SLIDE_ANIM_LOT_COUNT-1) */
  animLot: number;
  /** Texte marketing au-dessus du cadre (diapos images uniquement) */
  marketing?: { headline: string; sublines: string[] };
}

/**
 * Répartition pseudo-aléatoire des lots par index de slide (évite la monotonie,
 * reproductible pour une même liste d’images).
 */
export function computeAnimLot(imageIndex: number, imageCount: number): number {
  const mixed = (imageIndex * 2654435761) ^ (imageCount * 1597334677) ^ 0x9e3779b9;
  return Math.abs(mixed) % SLIDE_ANIM_LOT_COUNT;
}

export function buildPubSlides(images: ApkImageEntry[]): PubSlideDef[] {
  const perImage = computePerImageSlideMs(images.length);
  const slides: PubSlideDef[] = [
    {
      key: 'splash-opening',
      durationMs: slideTiming.splashOpeningMs,
      type: 'splash-open',
      animLot: 0,
    },
  ];

  if (images.length === 0) {
    slides.push({
      key: 'apk-placeholder',
      durationMs: Math.max(perImage, 8_000),
      type: 'placeholder',
      animLot: 0,
      marketing: {
        headline: 'Aucune capture dans apkImg',
        sublines: [
          'Ajoutez des images dans src/assets/apkImg pour alimenter la publicité.',
        ],
      },
    });
  } else {
    images.forEach((img, i) => {
      const rotId: SceneId =
        marketingRotationForImageSlides[
          i % marketingRotationForImageSlides.length
        ]!;
      slides.push({
        key: `img-${i}-${img.fileName}`,
        durationMs: perImage,
        type: 'image',
        src: img.src,
        fileName: img.fileName,
        animLot: computeAnimLot(i, images.length),
        marketing: {
          headline: marketingCopy[rotId].headline,
          sublines: marketingCopy[rotId].sublines,
        },
      });
    });
  }

  slides.push({
    key: 'splash-ending',
    durationMs: slideTiming.splashEndingMs,
    type: 'splash-close',
    animLot: 0,
  });

  return slides;
}
