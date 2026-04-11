export interface MarketingCopyBlock {
  headline: string;
  sublines: string[];
}

interface PubMarketingBarProps {
  /** null = masquer la barre */
  copy: MarketingCopyBlock | null;
}

/** Bandeau texte marketing au-dessus du cadre jaune */
export function PubMarketingBar({ copy }: PubMarketingBarProps) {
  if (!copy) return null;
  return (
    <div className="pub-marketing-bar">
      <h1 className="pub-marketing-bar__headline">{copy.headline}</h1>
      {copy.sublines.length > 0 && (
        <div className="pub-marketing-bar__sub">
          {copy.sublines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
