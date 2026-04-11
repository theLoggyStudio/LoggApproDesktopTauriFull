import type { ReactNode } from 'react';

interface YellowFrameProps {
  children: ReactNode;
  /** Modules prioritaires : cadre plus imposant */
  large?: boolean;
  className?: string;
}

/**
 * Cadre jaune type « fenêtre logiciel » sur fond violet.
 */
export function YellowFrame({ children, large, className = '' }: YellowFrameProps) {
  return (
    <div
      className={`pub-yellow-frame ${large ? 'pub-yellow-frame--large' : ''} ${className}`.trim()}
      role="presentation"
    >
      <div className="pub-yellow-frame__inner">{children}</div>
    </div>
  );
}
