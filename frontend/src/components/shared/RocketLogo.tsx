'use client';

/**
 * Rocket News logo — SVG recreation of the user's badge design.
 *
 * Elements:
 *   • Outer + inner concentric rings (brand blue)
 *   • "ROCKET NEWS" text arcing along the top (only at larger sizes)
 *   • Rocket ship pointing upward (white body, blue glow details)
 *   • Orbital ring (tilted ellipse) — back arc drawn before, front arc on top
 *   • Ascending candlestick pattern at the bottom (red→green breakout)
 */

interface Props {
  /** Rendered pixel size (width = height). */
  size?: number;
  /** Show the "ROCKET NEWS" text arc — only legible at ≥ 120 px. */
  showText?: boolean;
  className?: string;
}

// Brand palette
const RING  = '#3b82f6';   // accent blue
const GLOW  = '#60a5fa';   // light blue for highlights
const BODY  = '#e2e8f0';   // near-white rocket body
const BULL  = '#22c55e';
const BEAR  = '#ef4444';
const DOJI  = '#4b5563';

export default function RocketLogo({ size = 36, showText = true, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Rocket News"
    >
      <defs>
        {/* Arc path the "ROCKET NEWS" text follows — top half of r=78 circle */}
        <path id="rn-text-arc" d="M 22,100 A 78,78 0 0,0 178,100" />
      </defs>

      {/* ── Outer ring ── */}
      <circle cx="100" cy="100" r="96" stroke={RING} strokeWidth="3" />
      {/* ── Inner ring ── */}
      <circle cx="100" cy="100" r="85" stroke={RING} strokeWidth="1.5" />

      {/* ── Curved "ROCKET NEWS" text ── */}
      {showText && (
        <text
          fontSize="13"
          fill="white"
          fontWeight="700"
          letterSpacing="3.5"
          fontFamily="'Inter', system-ui, sans-serif"
        >
          <textPath href="#rn-text-arc" startOffset="50%" textAnchor="middle">
            ROCKET NEWS
          </textPath>
        </text>
      )}

      {/*
       * ── Orbital ring — BACK arc ──
       * Drawn before the rocket so it appears behind the rocket body.
       * Ellipse: rx=54 ry=17, rotated -30° around the logo centre.
       * "Back" = bottom half of the local ellipse (sweep=1 from right to left).
       */}
      <g transform="translate(100,100) rotate(-30)">
        <path
          d="M 54,0 A 54,17 0 0,1 -54,0"
          stroke={RING}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />
      </g>

      {/* ── Rocket ship ── */}

      {/* Nose cone (smooth ogive curve) */}
      <path d="M 100,38 Q 88,58 88,73 L 112,73 Q 112,58 100,38 Z" fill={BODY} />

      {/* Main body cylinder */}
      <rect x="88" y="73" width="24" height="38" fill={BODY} rx="1" />

      {/* Porthole window with blue glow */}
      <circle cx="100" cy="90" r="7.5" fill="#0f1117" />
      <circle cx="100" cy="90" r="5.5" fill="#1e3a5f" />
      <circle cx="97.5" cy="87.5" r="1.8" fill={GLOW} opacity="0.9" />

      {/* Delta fins */}
      <path d="M 88,100 L 71,118 L 88,115 Z" fill={BODY} />
      <path d="M 112,100 L 129,118 L 112,115 Z" fill={BODY} />

      {/* Engine bell */}
      <path d="M 91,111 L 109,111 L 106,121 L 94,121 Z" fill={GLOW} />

      {/* Thrust flame — two overlapping glows */}
      <ellipse cx="100" cy="125" rx="7" ry="5" fill={RING} opacity="0.85" />
      <ellipse cx="100" cy="127" rx="4" ry="3" fill={GLOW} opacity="0.95" />

      {/*
       * ── Orbital ring — FRONT arc ──
       * Drawn after the rocket so it appears in front of the rocket body.
       * "Front" = top half of the local ellipse (sweep=1 from left to right).
       */}
      <g transform="translate(100,100) rotate(-30)">
        <path
          d="M -54,0 A 54,17 0 0,1 54,0"
          stroke={RING}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </g>

      {/*
       * ── Candlestick chart — ascending breakout pattern ──
       * Positioned below the engine (y ≈ 138–168), representing the
       * price action that launched the rocket.
       * Left: two red (distribution/base) → doji → right: three green (breakout).
       */}

      {/* Candle 1 — bearish */}
      <line x1="65" y1="143" x2="65" y2="165" stroke={BEAR} strokeWidth="1.5" />
      <rect x="61.5" y="148" width="7" height="10" rx="0.5" fill={BEAR} />

      {/* Candle 2 — bearish */}
      <line x1="79" y1="137" x2="79" y2="159" stroke={BEAR} strokeWidth="1.5" />
      <rect x="75.5" y="142" width="7" height="10" rx="0.5" fill={BEAR} />

      {/* Candle 3 — doji (consolidation) */}
      <line x1="93" y1="131" x2="93" y2="154" stroke={DOJI} strokeWidth="1.5" />
      <rect x="89.5" y="137" width="7" height="9" rx="0.5" fill={DOJI} />

      {/* Candle 4 — bullish */}
      <line x1="107" y1="125" x2="107" y2="149" stroke={BULL} strokeWidth="1.5" />
      <rect x="103.5" y="130" width="7" height="13" rx="0.5" fill={BULL} />

      {/* Candle 5 — bullish (taller) */}
      <line x1="121" y1="118" x2="121" y2="143" stroke={BULL} strokeWidth="1.5" />
      <rect x="117.5" y="123" width="7" height="14" rx="0.5" fill={BULL} />

      {/* Candle 6 — breakout! */}
      <line x1="135" y1="111" x2="135" y2="141" stroke={BULL} strokeWidth="1.5" />
      <rect x="131.5" y="116" width="7" height="18" rx="0.5" fill={BULL} />
    </svg>
  );
}
