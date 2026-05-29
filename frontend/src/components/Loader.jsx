import React from 'react';
import './Loader.css';

/**
 * NarLoader — uses the real /favicon.svg split into two halves via CSS clip-path.
 * The top half slides in from above, bottom from below → join → rotate 180° → split out.
 *
 * Props:
 *  overlay    {boolean}   – cover parent with absolute overlay. default true.
 *  fullscreen {boolean}   – use fixed positioning (full viewport). default false.
 *  label      {string}    – text below the bolt. pass "" to hide. default "Loading…"
 *  size       {"md"|"sm"} – md = 72px bolt, sm = 26px inline. default "md".
 */
const NarLoader = ({
  overlay    = true,
  fullscreen = false,
  label      = 'Loading…',
  size       = 'md',
}) => {

  /* The actual bolt rendered via two clipped copies of the favicon */
  const Bolt = ({ sm }) => (
    <div className={`nar-bolt${sm ? ' nar-bolt-sm' : ''}`}>
      {/* Top half — clip-path reveals only the upper 50% of the image */}
      <div className="nar-bolt-half top">
        <img src="/favicon.svg" alt="" draggable={false} />
      </div>
      {/* Bottom half — clip-path reveals only the lower 50% */}
      <div className="nar-bolt-half bottom">
        <img src="/favicon.svg" alt="" draggable={false} />
      </div>
    </div>
  );

  /* ---- sm: inline badge ---- */
  if (size === 'sm') {
    return (
      <span className="nar-loader-inline">
        <Bolt sm />
        {label && (
          <span className="nar-loader-inline-label">{label}</span>
        )}
      </span>
    );
  }

  /* ---- md without overlay ---- */
  if (!overlay) return <Bolt />;

  /* ---- md with overlay ---- */
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
