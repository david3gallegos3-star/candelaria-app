import { useState } from 'react';

/**
 * Animated button with spinning cosmic gradient border.
 * Usage:
 *   <CosmicButton onClick={fn}>Texto</CosmicButton>
 *   <CosmicButton as="a" href="/ruta">Enlace</CosmicButton>
 */
export function CosmicButton({ as, children, onClick, href, style, ...props }) {
  const [hovered, setHovered] = useState(false);

  const inset = hovered ? '-3px' : '0px';

  const wrapper = {
    position: 'relative',
    display:  'inline-flex',
    minHeight: '44px',
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
    background: 'conic-gradient(from 0deg, #adfa1b, #c9ff63, #efffb7, #8cd413, #6f9f19, #92d61b, #adfa1b)',
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
    background: 'conic-gradient(from 180deg, #efffb7 0%, transparent 30%, #adfa1b 50%, transparent 70%, #7fbf17 100%)',
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
    fontWeight: 500,
    fontSize: '16px',
    letterSpacing: '0.02em',
    color: '#09090b',
    whiteSpace: 'nowrap',
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
