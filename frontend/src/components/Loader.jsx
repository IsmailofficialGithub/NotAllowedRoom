import React, { useId } from 'react';
import './Loader.css';

/**
 * NarLoader — Lightning bolt animation.
 * The top half drops in from above, the bottom half rises from below.
 * They join to form the full bolt, which then rotates 180°, then splits apart.
 *
 * Props:
 *  overlay    {boolean} – wrap in absolute overlay covering parent. default true.
 *  fullscreen {boolean} – use fixed positioning (covers full viewport). default false.
 *  label      {string}  – text shown below the bolt. default "Loading…". pass "" to hide.
 *  size       {"md"|"sm"} – md = 72px standalone, sm = 22px inline. default "md".
 */
const NarLoader = ({
  overlay = true,
  fullscreen = false,
  label = 'Loading…',
  size = 'md',
}) => {
  const uid = useId().replace(/:/g, '');

  /*
    Full bolt path inside a 48 × 72 viewBox.
    The bolt is split at y = 36 (vertical midpoint).
    Top half  → clipped to rect(0 0 48 36)
    Bottom half → clipped to rect(0 36 48 36)
  */
  const VIEWBOX = '0 0 48 72';
  const PATH = 'M34 2 L6 40 L22 40 L14 70 L42 32 L26 32 Z';

  const BoltHalf = ({ half }) => {
    const gId = `g-${uid}-${half}`;
    const cId = `c-${uid}-${half}`;
    const isTop = half === 'top';

    return (
      <svg
        viewBox={VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="48" y2="72" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <clipPath id={cId}>
            {/* Top half: rows 0-36. Bottom half: rows 36-72 */}
            <rect x="0" y={isTop ? 0 : 36} width="48" height="36" />
          </clipPath>
        </defs>
        <path
          d={PATH}
          fill={`url(#${gId})`}
          clipPath={`url(#${cId})`}
          style={{
            filter: `drop-shadow(0 0 10px rgba(168,85,247,0.7))`,
          }}
        />
      </svg>
    );
  };

  const Bolt = () => (
    <div className="nar-bolt">
      <div className="nar-bolt-half top">
        <BoltHalf half="top" />
      </div>
      <div className="nar-bolt-half bottom">
        <BoltHalf half="bottom" />
      </div>
    </div>
  );

  /* ---- Small inline variant ---- */
  if (size === 'sm') {
    return (
      <span className="nar-loader-inline">
        <Bolt />
        {label && (
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {label}
          </span>
        )}
      </span>
    );
  }

  /* ---- Standalone (no overlay) ---- */
  if (!overlay) {
    return <Bolt />;
  }

  /* ---- Overlay variant ---- */
  return (
    <div
      className={`nar-loader-overlay${fullscreen ? ' fullscreen' : ''}`}
      role="status"
      aria-label={label || 'Loading'}
    >
      <Bolt />
      {label && <p className="nar-loader-label">{label}</p>}
    </div>
  );
};

export default NarLoader;
