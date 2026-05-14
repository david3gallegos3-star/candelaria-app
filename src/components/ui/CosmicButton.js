import { useState } from 'react';

/**
 * Animated button with spinning cosmic gradient border.
 * Usage:
 *   <CosmicButton onClick={fn}>Texto</CosmicButton>
 *   <CosmicButton as="a" href="/ruta">Enlace</CosmicButton>
 */
// colors: { c1, c2, c3 } — colores del gradiente. Por defecto verde lima (original).
const PRESETS = {
  green: { c1: '#adfa1b', c2: '#c9ff63', c3: '#6f9f19' },
  blue:  { c1: '#3b82f6', c2: '#93c5fd', c3: '#1d4ed8' },
  red:   { c1: '#ef4444', c2: '#fca5a5', c3: '#b91c1c' },
  purple:{ c1: '#a855f7', c2: '#d8b4fe', c3: '#7e22ce' },
};

export function CosmicButton({ as, children, onClick, href, style, colors, labelStyle, ...props }) {
  const [hovered, setHovered] = useState(false);

  const pal = typeof colors === 'string'
    ? (PRESETS[colors] || PRESETS.green)
    : (colors || PRESETS.green);
  const { c1, c2, c3 } = pal;

  const inset = hovered ? '-3px' : '0px';

  const wrapper = {
    position: 'relative',
    display:  'inline-flex',
    minHeight: '36px',
    minWidth:  '44px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '15px',
    padding: '3px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 0.15s',
    ...style,
  };

  const spinLayer = {
    position: 'absolute',
    inset: inset,
    overflow: 'hidden',
    borderRadius: '15px',
    transition: 'inset 0.3s ease-out',
  };

  const spinInner = {
    position: 'absolute',
    inset: '-200%',
    background: `conic-gradient(from 0deg, ${c1}, ${c2}, #efffb7, ${c3}, ${c3}, ${c1}, ${c1})`,
    opacity: 0.95,
  };

  const slowLayer = {
    position: 'absolute',
    inset: inset,
    overflow: 'hidden',
    borderRadius: '15px',
    opacity: 0.45,
    mixBlendMode: 'soft-light',
    transition: 'inset 0.3s ease-out',
  };

  const slowInner = {
    position: 'absolute',
    inset: '-200%',
    background: `conic-gradient(from 180deg, ${c2} 0%, transparent 30%, ${c1} 50%, transparent 70%, ${c3} 100%)`,
  };

  const inner = {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderRadius: '12px',
    background: '#f4f4f5',
    padding: '10px 20px',
    boxShadow: hovered
      ? 'inset 0 1px 0 rgba(255,255,255,0.82), inset 0 -1px 0 rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.14), 0 12px 34px rgba(15,23,42,0.2)'
      : 'inset 0 1px 0 rgba(255,255,255,0.72), inset 0 -1px 0 rgba(15,23,42,0.08), 0 1px 1px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.14)',
    transition: 'box-shadow 0.3s',
  };

  const label = {
    fontWeight: 600,
    fontSize: '13px',
    letterSpacing: '0.01em',
    color: '#09090b',
    whiteSpace: 'nowrap',
    ...labelStyle,
  };

  const content = (
    <>
      <span style={spinLayer}>
        <span className="cosmic-spin" style={spinInner} />
      </span>
      <span style={slowLayer}>
        <span className="cosmic-spin-slow" style={slowInner} />
      </span>
      <span style={inner}>
        <span style={label}>{children ?? 'Button'}</span>
      </span>
    </>
  );

  const handlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  if (as === 'a') {
    return (
      <a style={wrapper} href={href} {...handlers} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button style={wrapper} onClick={onClick} {...handlers} {...props}>
      {content}
    </button>
  );
}

export default CosmicButton;
