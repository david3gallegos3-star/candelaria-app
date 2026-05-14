import React, { createContext, useContext, useMemo, memo } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

const MemoizedLiquidMetal = memo(LiquidMetal);

// ── Context ───────────────────────────────────────────────
const HeroContext = createContext(undefined);
function useHeroCtx() {
  const ctx = useContext(HeroContext);
  if (!ctx) throw new Error('HeroLiquidMetal components must be inside HeroLiquidMetalRoot');
  return ctx;
}
export function useHeroLiquidMetal() { return useHeroCtx(); }

// ── Defaults ──────────────────────────────────────────────
const defaultDesktopShader = {
  width: 1280, height: 720,
  colorBack: '#ffffff00', colorTint: '#2c5d72',
  repetition: 6, softness: 0.8,
  shiftRed: 1, shiftBlue: -1,
  distortion: 0.4, contour: 0.4,
  angle: 0, speed: 1, scale: 0.6, fit: 'contain',
};
const defaultMobileShader = {
  colorBack: '#ffffff00', colorTint: '#2c5d72',
  repetition: 6, softness: 0.8,
  shiftRed: 1, shiftBlue: -1,
  distortion: 0.4, contour: 0.4,
  angle: 0, speed: 1, scale: 0.68, fit: 'contain',
  style: { height: '100%', width: '100%' },
};

// ── Root ──────────────────────────────────────────────────
export function HeroLiquidMetalRoot({
  style, children,
  title = 'Candelaria',
  subtitle = 'Sistema de Gestión',
  description,
  showCta = true,
  ctaLabel = 'Comenzar',
  ctaHref = '#',
  onCtaClick,
  showBadges = false,
  techStack = [],
  desktopShaderProps,
  mobileShaderProps,
  colorTint,
  speed,
  distortion,
  scale,
  ...props
}) {
  const overrides = useMemo(() => {
    const o = {};
    if (colorTint  !== undefined) o.colorTint  = colorTint;
    if (speed      !== undefined) o.speed      = speed;
    if (distortion !== undefined) o.distortion = distortion;
    if (scale      !== undefined) o.scale      = scale;
    return o;
  }, [colorTint, speed, distortion, scale]);

  const mergedDesktop = useMemo(() => ({ ...defaultDesktopShader, ...overrides, ...desktopShaderProps }), [overrides, desktopShaderProps]);
  const mergedMobile  = useMemo(() => ({ ...defaultMobileShader,  ...overrides, ...mobileShaderProps,
    style: { ...defaultMobileShader.style, ...(mobileShaderProps?.style || {}) }
  }), [overrides, mobileShaderProps]);

  const ctx = useMemo(() => ({
    title, subtitle, description,
    showCta, ctaLabel, ctaHref, onCtaClick,
    showBadges, techStack,
    mergedDesktop, mergedMobile,
  }), [title, subtitle, description, showCta, ctaLabel, ctaHref, onCtaClick, showBadges, techStack, mergedDesktop, mergedMobile]);

  return (
    <HeroContext.Provider value={ctx}>
      <section style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }} {...props}>
        <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>{title}</h1>
        {children}
      </section>
    </HeroContext.Provider>
  );
}

// ── Container (grid layout) ───────────────────────────────
export function HeroLiquidMetalContainer({ style, children, ...props }) {
  return (
    <div style={{
      position: 'relative', zIndex: 10,
      display: 'grid', gap: '24px',
      paddingBottom: '64px',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      alignItems: 'center',
      ...style,
    }} {...props}>
      {children}
    </div>
  );
}

// ── Content (left column) ─────────────────────────────────
export function HeroLiquidMetalContent({ style, children, ...props }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', gap: '20px',
      ...style,
    }} {...props}>
      {children}
    </div>
  );
}

// ── Heading ───────────────────────────────────────────────
export function HeroLiquidMetalHeading({ style, title, subtitle, headingStyle, children, ...props }) {
  const ctx = useHeroCtx();
  const t = title    ?? ctx.title;
  const s = subtitle ?? ctx.subtitle;
  return (
    <div style={{ textAlign: 'center', ...style }} {...props}>
      {children ?? (
        <h2 style={{
          margin: 0, fontWeight: 500,
          fontSize: 'clamp(28px, 5vw, 64px)',
          letterSpacing: '-0.04em', lineHeight: 1.1,
          ...headingStyle,
        }}>
          {t}<br />{s}
        </h2>
      )}
    </div>
  );
}

// ── Description ───────────────────────────────────────────
export function HeroLiquidMetalDescription({ style, description, descStyle, children, ...props }) {
  const ctx = useHeroCtx();
  const d = description ?? ctx.description;
  if (!d) return null;
  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center', ...style }} {...props}>
      {children ?? (
        <p style={{ margin: 0, fontSize: '16px', opacity: 0.7, ...descStyle }}>{d}</p>
      )}
    </div>
  );
}

// ── CTA ───────────────────────────────────────────────────
export function HeroLiquidMetalActions({ style, showCta, ctaLabel, ctaHref, onCtaClick, children, ...props }) {
  const ctx = useHeroCtx();
  const show  = showCta  ?? ctx.showCta;
  const label = ctaLabel ?? ctx.ctaLabel;
  const href  = ctaHref  ?? ctx.ctaHref;
  const onClick = onCtaClick ?? ctx.onCtaClick;
  if (!show) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', ...style }} {...props}>
      {children ?? (
        <a href={href} onClick={onClick} style={{
          display: 'inline-block', padding: '12px 28px',
          background: '#1a1a2e', color: 'white',
          borderRadius: '8px', textDecoration: 'none',
          fontWeight: 600, fontSize: '15px',
        }}>
          {label}
        </a>
      )}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────
export function HeroLiquidMetalBadges({ style, showBadges, techStack, ...props }) {
  const ctx = useHeroCtx();
  const show  = showBadges ?? ctx.showBadges;
  const stack = techStack  ?? ctx.techStack;
  if (!show || !stack.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', ...style }} {...props}>
      {stack.map((tech) => {
        const Icon = tech.icon;
        return (
          <span key={tech.name} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '999px',
            border: '1px solid rgba(0,0,0,0.15)',
            background: 'white', fontSize: '12px', fontWeight: 600,
          }}>
            {Icon && <Icon width={14} height={14} style={{ opacity: 0.8 }} />}
            {tech.name}
            {tech.version && <span style={{ fontFamily: 'monospace', opacity: 0.5, fontSize: '11px' }}>{tech.version}</span>}
          </span>
        );
      })}
    </div>
  );
}

// ── Desktop Visual (shader) ───────────────────────────────
export function HeroLiquidMetalVisual({ style, desktopShaderProps, image, ...props }) {
  const ctx = useHeroCtx();
  const shaderProps = { ...ctx.mergedDesktop, ...desktopShaderProps };
  return (
    <div style={{
      position: 'relative', height: '400px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', borderRadius: '50%',
      ...style,
    }} {...props}>
      <MemoizedLiquidMetal {...shaderProps} image={image ?? shaderProps.image} />
    </div>
  );
}

// ── Mobile Visual (shader, background) ───────────────────
export function HeroLiquidMetalMobileVisual({ style, mobileShaderProps, image, ...props }) {
  const ctx = useHeroCtx();
  const shaderProps = { ...ctx.mergedMobile, ...mobileShaderProps,
    style: { ...ctx.mergedMobile.style, ...(mobileShaderProps?.style || {}) }
  };
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: '-96px',
      height: '360px', overflow: 'hidden', zIndex: -1,
      ...style,
    }} {...props}>
      <MemoizedLiquidMetal {...shaderProps} image={image ?? shaderProps.image} />
    </div>
  );
}

// ── Convenience all-in-one ────────────────────────────────
export function HeroLiquidMetal({
  containerStyle, contentStyle,
  headingWrapStyle, headingStyle,
  descriptionWrapStyle, descStyle,
  ctaWrapStyle, badgesWrapStyle,
  visualStyle, mobileVisualStyle,
  ...props
}) {
  return (
    <HeroLiquidMetalRoot {...props}>
      <HeroLiquidMetalContainer style={containerStyle}>
        <HeroLiquidMetalContent style={contentStyle}>
          <HeroLiquidMetalHeading    style={headingWrapStyle}     headingStyle={headingStyle} />
          <HeroLiquidMetalDescription style={descriptionWrapStyle} descStyle={descStyle} />
          <HeroLiquidMetalActions    style={ctaWrapStyle} />
          <HeroLiquidMetalBadges     style={badgesWrapStyle} />
        </HeroLiquidMetalContent>
        <HeroLiquidMetalVisual style={visualStyle} />
      </HeroLiquidMetalContainer>
      <HeroLiquidMetalMobileVisual style={mobileVisualStyle} />
    </HeroLiquidMetalRoot>
  );
}

export default HeroLiquidMetal;
