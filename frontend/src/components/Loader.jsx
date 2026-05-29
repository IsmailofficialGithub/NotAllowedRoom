import React, { useId } from 'react';
import './Loader.css';

/**
 * NarLoader — Lightning bolt animation matching the app favicon.
 * Top half slides in from above, bottom half rises from below.
 * They join → full bolt → rotates 180° → splits apart. Loops.
 *
 * Props:
 *  overlay    {boolean}   – cover parent with absolute overlay. default true.
 *  fullscreen {boolean}   – use fixed positioning (full viewport). default false.
 *  label      {string}    – text below the bolt. pass "" to hide. default "Loading…"
 *  size       {"md"|"sm"} – md = 72px, sm = 22px inline. default "md".
 */
const NarLoader = ({
  overlay = true,
  fullscreen = false,
  label = 'Loading…',
  size = 'md',
}) => {
  const uid = useId().replace(/:/g, '');

  /*
    Exact favicon bolt path — viewBox "0 0 48 46"
    Split horizontally at y = 23 (midpoint of 46).
    Top clip:    rect(0 0 48 23)
    Bottom clip: rect(0 23 48 23)
  */
  const PATH =
    'M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z';

  const BoltHalf = ({ half }) => {
    const gId = `g-${uid}-${half}`;
    const cId = `c-${uid}-${half}`;

    return (
      <svg
        viewBox="0 0 48 46"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="48" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#b06cff" />
            <stop offset="50%" stopColor="#8b3cf7" />
            <stop offset="100%" stopColor="#4a9eff" />
          </linearGradient>
          <clipPath id={cId}>
            <rect
              x="0"
              y={half === 'top' ? 0 : 23}
              width="48"
              height="23"
            />
          </clipPath>
        </defs>
        <path
          d={PATH}
          fill={`url(#${gId})`}
          clipPath={`url(#${cId})`}
          style={{ filter: 'drop-shadow(0 0 8px rgba(176, 108, 255, 0.75))' }}
        />
      </svg>
    );
  };

  const Bolt = ({ isSmall }) => (
    <div className={`nar-bolt${isSmall ? ' nar-bolt-sm' : ''}`}>
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
        <Bolt isSmall />
        {label && (
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {label}
          </span>
        )}
      </span>
    );
  }

  /* ---- Standalone (no overlay) ---- */
  if (!overlay) return <Bolt />;

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
