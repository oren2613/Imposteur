import { useState, useEffect } from 'react';
import './StickmanParade.css';

interface StickmanProps {
  /** Imposteur = chapeau + couleur noir/blanc */
  isImpostor?: boolean;
  /** Pose : marche normale, salut, ou pointer (toujours en déplacement, plus lent) */
  pose?: 'walk' | 'wave' | 'point';
  /** Délai avant de commencer l'animation (s) */
  delay?: number;
  /** Sens de marche (1 = vers la droite, -1 = vers la gauche) */
  direction?: 1 | -1;
  /** Durée d'un trajet (s) pour varier les vitesses */
  duration?: number;
}

/** Objets affichés dans la bulle de pensée (SVG minimalistes) */
const BUBBLE_OBJECTS = [
  /* Ampoule */
  () => (
    <g className="bubble-object" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="12" cy="10" r="4" />
      <path d="M10 14v2h4v-2M11 8h2" />
      <path d="M12 6v1M12 16v1M9 10h1M15 10h1M10 12h1M14 12h1" />
    </g>
  ),
  /* Clé */
  () => (
    <g className="bubble-object" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="10" cy="12" r="3" />
      <rect x="12" y="10" width="6" height="4" rx="1" />
      <path d="M18 12h2" />
    </g>
  ),
  /* Point d'interrogation */
  () => (
    <g className="bubble-object" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round">
      <path d="M9 8a3 3 0 1 1 3 3v1M12 14v2" />
    </g>
  ),
  /* Loupe */
  () => (
    <g className="bubble-object" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="4" />
      <path d="M14 14l4 4" />
    </g>
  ),
  /* Étoile / idée */
  () => (
    <g className="bubble-object" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round">
      <path d="M12 6l1.5 4.5L18 12l-4.5 1.5L12 18l-1.5-4.5L6 12l4.5-1.5L12 6z" />
    </g>
  ),
  /* Exclamation */
  () => (
    <g className="bubble-object" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round">
      <path d="M12 6v6M12 14v1" />
    </g>
  ),
];

function Stickman({ isImpostor, pose = 'walk', delay = 0, direction = 1, duration = 18 }: StickmanProps) {
  const isWave = pose === 'wave';
  const isPoint = pose === 'point';
  return (
    <div
      className={`stickman ${isImpostor ? 'stickman--impostor' : ''} ${direction === -1 ? 'stickman--reverse' : ''} ${isWave ? 'stickman--wave' : ''} ${isPoint ? 'stickman--point' : ''}`}
      style={{
        ['--delay' as string]: `${delay}s`,
        ['--duration' as string]: `${duration}s`,
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 48"
        className="stickman__svg"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="12" cy="8" r="5" className="stickman__head" />
        {isImpostor && (
          <g className="stickman__hat">
            <ellipse cx="12" cy="5.8" rx="6" ry="1.4" fill="currentColor" />
            <path d="M6 5.8 Q 12 -0.5 18 5.8 L 6 5.8 Z" fill="currentColor" />
          </g>
        )}
        <line x1="12" y1="13" x2="12" y2="26" className="stickman__body" />
        {pose === 'walk' && (
          <>
            <line x1="12" y1="16" x2="6" y2="22" className="stickman__arm stickman__arm--left" />
            <line x1="12" y1="16" x2="18" y2="22" className="stickman__arm stickman__arm--right" />
          </>
        )}
        {pose === 'wave' && (
          <>
            <line x1="12" y1="16" x2="6" y2="14" className="stickman__arm stickman__arm--left" />
            <line x1="12" y1="16" x2="18" y2="22" className="stickman__arm stickman__arm--right" />
          </>
        )}
        {pose === 'point' && (
          <>
            <line x1="12" y1="16" x2="4" y2="8" className="stickman__arm stickman__arm--left" />
            <line x1="12" y1="16" x2="18" y2="22" className="stickman__arm stickman__arm--right" />
          </>
        )}
        <line x1="12" y1="26" x2="8" y2="40" className="stickman__leg stickman__leg--left" />
        <line x1="12" y1="26" x2="16" y2="40" className="stickman__leg stickman__leg--right" />
      </svg>
    </div>
  );
}

function StickmanThinking({
  delay = 0,
  direction = 1,
  duration = 20,
}: Pick<StickmanProps, 'delay' | 'direction' | 'duration'>) {
  const [bubbleIndex, setBubbleIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBubbleIndex((i) => (i + 1) % BUBBLE_OBJECTS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const BubbleIcon = BUBBLE_OBJECTS[bubbleIndex];

  return (
    <div
      className={`stickman stickman--thinking ${direction === -1 ? 'stickman--reverse' : ''}`}
      style={{
        ['--delay' as string]: `${delay}s`,
        ['--duration' as string]: `${duration}s`,
      }}
      aria-hidden
    >
      <div className="stickman__bubble">
        <svg viewBox="0 0 24 24" className="stickman__bubble-svg">
          <BubbleIcon />
        </svg>
      </div>
      <svg
        viewBox="0 0 24 48"
        className="stickman__svg"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="12" cy="8" r="5" className="stickman__head" />
        <line x1="12" y1="13" x2="12" y2="26" className="stickman__body" />
        <line x1="12" y1="16" x2="8" y2="10" className="stickman__arm stickman__arm--left" />
        <line x1="12" y1="16" x2="18" y2="22" className="stickman__arm stickman__arm--right" />
        <line x1="12" y1="26" x2="8" y2="40" className="stickman__leg stickman__leg--left" />
        <line x1="12" y1="26" x2="16" y2="40" className="stickman__leg stickman__leg--right" />
      </svg>
    </div>
  );
}

export function StickmanParade() {
  return (
    <div className="stickman-parade" aria-hidden>
      <Stickman delay={0} direction={1} duration={20} />
      <StickmanThinking delay={3} direction={-1} duration={22} />
      <Stickman delay={2} direction={1} duration={18} />
      <Stickman delay={7} direction={-1} duration={24} />
      {/* Marche lente + salut (reste en mouvement) */}
      <Stickman pose="wave" delay={1} direction={1} duration={36} />
      <Stickman isImpostor delay={5} direction={-1} duration={21} />
      <Stickman delay={9} direction={1} duration={23} />
      {/* Marche lente + pointer */}
      <Stickman pose="point" delay={6} direction={-1} duration={38} />
    </div>
  );
}
