import React, { useId } from 'react';
import './Loader.css';

/**
 * NarLoader — Two bolt halves slide in from both sides, meet, then rotate 180°.
 *
 * Props:
 *  - overlay    : boolean — wrap in a full-overlay (absolute, covers parent). default true.
 *  - fullscreen : boolean — use position:fixed instead of absolute. default false.
 *  - label      : string  — optional text below the bolt. default "Loading…"
 *  - size       : "sm" | "md" — sm = 24px inline variant. default "md"
 */
const NarLoader = ({
  overlay = true,
  fullscreen = false,
  label = 'Loading…',
  size = 'md',
}) => {
  const uid = useId().replace(/:/g, '');

  // SVG bolt — the same full shape clipped per half via unique IDs.
  // ViewBox: 0 0 40 56. Split y = 28.
  const BoltSVG = ({ half }) => {
    const gradId = `ng-${uid}-${half}`;
    const clipId = `clip-${uid}-${half}`;
    const clipY = half === 'top' ? 0 : 28;

    return (
      <svg viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="40" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x="0" y={clipY} width="40" height="28" />
          </clipPath>
        </defs>
        <path
          d="M26 2 L4 30 L17 30 L14 54 L36 26 L23 26 Z"
          fill={`url(#${gradId})`}
          clipPath={`url(#${clipId})`}
          style={{ filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.6))' }}
        />
      </svg>
    );
  };

  if (size === 'sm') {
    return (
      <span className="nar-loader-inline">
        <span className="nar-loader">
          <span className="half-top"><BoltSVG half="top" /></span>
          <span className="half-bottom"><BoltSVG half="bottom" /></span>
        </span>
        {label && (
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {label}
          </span>
        )}
      </span>
    );
  }

  const inner = (
    <div className="nar-loader" role="status" aria-label={label || 'Loading'}>
      <span className="half-top"><BoltSVG half="top" /></span>
      <span className="half-bottom"><BoltSVG half="bottom" /></span>
    </div>
  );

  if (!overlay) return inner;

  return (
    <div className={`nar-loader-overlay${fullscreen ? ' fullscreen' : ''}`}>
      {inner}
      {label && <p className="nar-loader-label">{label}</p>}
    </div>
  );
};

export default NarLoader;
