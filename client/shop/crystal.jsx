/* global React, window */
// Reusable crystal cluster — clip-path facets with multiply blend.
// (From the MochiOS design system; used at corners of stone panels / hero.)

const CRYSTAL_PALETTES = {
  red:       ["#E32636", "#FF80AB", "#8E44AD"],
  blue:      ["#3B82F6", "#4DD0E1", "#2C3E50"],
  yellow:    ["#FFD700", "#E67E22", "#D4E157"],
  green:     ["#A4C639", "#2ECC71", "#1ABC9C"],
  purple:    ["#8E44AD", "#FF80AB", "#2C3E50"],
  orange:    ["#E67E22", "#FFD700", "#E32636"],
  emerald:   ["#2ECC71", "#A4C639", "#1ABC9C"],
  turquoise: ["#1ABC9C", "#4DD0E1", "#3B82F6"],
  pink:      ["#FF80AB", "#E32636", "#8E44AD"],
  ice:       ["#4DD0E1", "#3B82F6", "#FFFFFF"],
  meadow:    ["#D4E157", "#A4C639", "#FFD700"],
  storm:     ["#2C3E50", "#3B82F6", "#8E44AD"],
};

const CORNER_SHAPES = {
  br: [
    "polygon(0% 100%, 100% 100%, 100% 0%)",
    "polygon(20% 100%, 100% 100%, 100% 35%)",
    "polygon(45% 100%, 95% 100%, 100% 60%)",
    "polygon(65% 100%, 100% 100%, 100% 80%)",
  ],
  tl: [
    "polygon(0% 0%, 100% 0%, 0% 100%)",
    "polygon(0% 0%, 80% 0%, 0% 65%)",
    "polygon(0% 5%, 60% 0%, 0% 40%)",
  ],
  tr: [
    "polygon(0% 0%, 100% 0%, 100% 100%)",
    "polygon(20% 0%, 100% 0%, 100% 80%)",
    "polygon(40% 0%, 100% 0%, 100% 50%)",
  ],
  bl: [
    "polygon(0% 0%, 0% 100%, 100% 100%)",
    "polygon(0% 20%, 0% 100%, 80% 100%)",
    "polygon(0% 40%, 0% 100%, 60% 100%)",
  ],
};

function CrystalCluster({ corner = "br", size = 140, palette = "red", density = 1, style = {} }) {
  const colors = CRYSTAL_PALETTES[palette] || CRYSTAL_PALETTES.red;
  const shapes = CORNER_SHAPES[corner] || CORNER_SHAPES.br;
  const scale = density;
  const positionMap = {
    br: { right: 0, bottom: 0 }, tl: { left: 0, top: 0 },
    tr: { right: 0, top: 0 }, bl: { left: 0, bottom: 0 },
  };
  return (
    <div className="cluster" style={{ position: "absolute", width: size * scale, height: size * scale,
      pointerEvents: "none", ...positionMap[corner], ...style }}>
      {shapes.map((clip, i) => (
        <div key={i} className="facet" style={{ position: "absolute", inset: 0,
          background: colors[i % colors.length], clipPath: clip, opacity: 0.85 - i * 0.08,
          mixBlendMode: "multiply", boxShadow: "inset 1px 1px 12px rgba(255,255,255,0.4)" }}>
          <div style={{ position: "absolute", inset: 0,
            background: "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)",
            clipPath: clip, pointerEvents: "none" }} />
        </div>
      ))}
    </div>
  );
}

window.CrystalCluster = CrystalCluster;
window.CRYSTAL_PALETTES = CRYSTAL_PALETTES;
