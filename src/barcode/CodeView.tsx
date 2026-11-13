import { useMemo } from 'react';
import { pathOf, qrModules, sideOf } from './draw';

/**
 * A code, drawn (DESIGN.md §13.2, §13.3): an SVG that fills the width it is given, **black on white whatever the theme** (a scanner reads contrast, and a
 * dark theme would invert it; this is the one place a colour is not a token, because it is not a colour of the interface but a property of the code), with
 * the quiet zone the format asks for. It has no dependency on the app: a candidate for the design system once it has settled (DESIGN.md §26.7).
 */
export function CodeView({
  payload,
  label,
  size,
}: {
  payload: string;
  /** What a screen reader says: the title of the card, never the payload. */
  label: string;
  /** A fixed side in CSS pixels, or the full width of the container when absent. */
  size?: number;
}) {
  const drawn = useMemo(() => {
    try {
      const modules = qrModules(payload);
      return { path: pathOf(modules), side: sideOf(modules) };
    } catch {
      return null;
    }
  }, [payload]);
  if (!drawn) return <p role="alert">This code cannot be drawn.</p>;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${drawn.side} ${drawn.side}`}
      shapeRendering="crispEdges"
      style={
        size ? { width: size, height: size } : { width: '100%', height: 'auto', display: 'block' }
      }
    >
      <rect width={drawn.side} height={drawn.side} fill="#fff" />
      <path d={drawn.path} fill="#000" />
    </svg>
  );
}
