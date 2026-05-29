import React from 'react';
import './Loader.css';

/**
 * NarLoader — Two bolt halves slide from bottom, meet, then rotate 180°.
 *
 * Props:
 *  - overlay   : boolean — wrap in a full-overlay (absolute, covers parent). default true.
 *  - fullscreen : boolean — use position:fixed instead of absolute. default false.
 *  - label     : string  — optional text below the bolt. default "Loading..."
 *  - size      : "sm" | "md" — sm = 24px inline variant. default "md"
 */
const NarLoader = ({
  overlay = true,
  fullscreen = false,
  label = 'Loading…',
  size = 'md',
}) => {
  // The bolt is a classic lightning shape split horizontally at the centre.
  // Top half: the upper zigzag portion.
  // Bottom half: the lower zigzag portion.
  //
  // ViewBox: 0 0 40 56  — matches the favicon proportions.
  // Split point: y = 28 (vertical centre).

  const BoltSVG = ({ half }) => (
    <svg viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`ng-${half}`} x1="0" y1="0" x2="40" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        {/* Clip to only show top or bottom half */}
        {half === 'top' && (
          <clipPath id="clip-top">
            <rect x="0" y="0" width="40" height="28" />
          </clipPath>
        )}
        {half === 'bottom' && (
          <clipPath id="clip-bottom">
            <rect x="0" y="28" width="40" height="28" />
          </clipPath>
        )}
      </defs>
      {/*
        Full bolt path — the same shape for both halves,
        just clipped to the relevant region.
        Path: top-right point → down-left diagonal → centre tab → down-left → bottom point.
      */}
      <path
        d="M26 2 L4 30 L17 30 L14 54 L36 26 L23 26 Z"
        fill={`url(#ng-${half})`}
        clipPath={`url(#clip-${half})`}
        style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.55))' }}
      />
    </svg>
  );

  if (size === 'sm') {
    return (
      <span className="nar-loader-inline">
        <span className="nar-loader">
          <span className="half-top">
            <BoltSVG half="top" />
          </span>
          <span className="half-bottom">
            <BoltSVG half="bottom" />
          </span>
        </span>
        {label && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>}
      </span>
    );
  }

  const inner = (
    <div className="nar-loader" aria-label="Loading" role="status">
      <span className="half-top">
        <BoltSVG half="top" />
      </span>
      <span className="half-bottom">
        <BoltSVG half="bottom" />
      </span>
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
