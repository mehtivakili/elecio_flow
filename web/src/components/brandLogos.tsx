import { useState, type ReactNode } from 'react';

/**
 * Controller brand logos. Each brand is drawn as its wordmark (colours and lettering as on
 * the controllers) so nothing has to be downloaded. An official file placed at
 * web/public/brands/<key>.svg — or .png — is used instead automatically.
 */

const FONT = 'Arial Black, Arial, Helvetica, sans-serif';

function Word({ text, color, size = 22, weight = 900, italic, spacing = 0, y = 27, width }: {
  text: string; color: string; size?: number; weight?: number; italic?: boolean; spacing?: number; y?: number; width?: number;
}) {
  return (
    <text x="60" y={y} textAnchor="middle" fill={color} fontFamily={FONT} fontWeight={weight} fontSize={size}
      fontStyle={italic ? 'italic' : 'normal'} letterSpacing={spacing} textLength={width} lengthAdjust={width ? 'spacingAndGlyphs' : undefined}>
      {text}
    </text>
  );
}

/** Tile background + artwork per brand (viewBox 120 × 40). */
const ART: Record<string, { bg: string; art: ReactNode }> = {
  fanuc: { bg: '#111111', art: <Word text="FANUC" color="#FFD100" size={24} width={96} /> },
  siemens: { bg: '#ffffff', art: <Word text="SIEMENS" color="#009999" size={21} weight={700} width={100} /> },
  heidenhain: { bg: '#ffffff', art: <Word text="HEIDENHAIN" color="#003A70" size={15} weight={700} width={104} y={25} /> },
  mitsubishi: {
    bg: '#ffffff',
    art: (
      <g>
        {/* three diamonds around a common centre (60,19), pointing up, down-left and down-right */}
        <path d="M60 19 L64.6 11 L60 3 L55.4 11 Z" fill="#E60012" />
        <path d="M60 19 L50.77 19.02 L46.14 27 L55.37 26.98 Z" fill="#E60012" />
        <path d="M60 19 L69.23 19.02 L73.86 27 L64.63 26.98 Z" fill="#E60012" />
        <text x="60" y="37.5" textAnchor="middle" fill="#111" fontFamily={FONT} fontWeight={900} fontSize={8.5} textLength={72} lengthAdjust="spacingAndGlyphs">MITSUBISHI</text>
      </g>
    ),
  },
  haas: { bg: '#ffffff', art: <Word text="HAAS" color="#C8102E" size={26} italic width={84} y={29} /> },
  mazak: { bg: '#ffffff', art: <Word text="MAZAK" color="#141414" size={24} italic width={96} y={29} /> },
  okuma: { bg: '#ffffff', art: <Word text="OKUMA" color="#004A98" size={23} width={96} y={29} /> },
  fagor: {
    bg: '#ffffff',
    art: (<g><Word text="FAGOR" color="#E30613" size={20} width={84} y={23} /><text x="60" y="35" textAnchor="middle" fill="#555" fontFamily="Arial, sans-serif" fontWeight={700} fontSize={7} letterSpacing={2}>AUTOMATION</text></g>),
  },
  syntec: { bg: '#ffffff', art: <Word text="SYNTEC" color="#0066B3" size={21} width={96} y={28} /> },
  gsk: { bg: '#ffffff', art: <Word text="GSK" color="#E60012" size={27} italic width={70} y={30} /> },
  knd: { bg: '#ffffff', art: <Word text="KND" color="#00479D" size={27} width={70} y={30} /> },
  brother: { bg: '#ffffff', art: <Word text="brother" color="#0D2C8F" size={22} weight={700} width={90} y={28} /> },
  hurco: { bg: '#ffffff', art: <Word text="HURCO" color="#003B71" size={22} width={92} y={28} /> },
  num: { bg: '#ffffff', art: <Word text="NUM" color="#00529B" size={27} width={72} y={30} /> },
  fidia: { bg: '#ffffff', art: <Word text="FIDIA" color="#004A99" size={23} width={86} y={29} /> },
  delta: {
    bg: '#ffffff',
    art: (<g><path d="M14 30 L24 10 L34 30 Z" fill="#0072CE" /><text x="72" y="28" textAnchor="middle" fill="#0072CE" fontFamily={FONT} fontWeight={900} fontSize={19} textLength={68} lengthAdjust="spacingAndGlyphs">DELTA</text></g>),
  },
  lnc: { bg: '#ffffff', art: <Word text="LNC" color="#0F5BA8" size={27} width={70} y={30} /> },
};

const failed = new Set<string>();

/**
 * Logo tile of a controller brand. `custom` brands (added by the workspace) show their name
 * on their colour.
 */
export function BrandLogo({ brand, label, color, height = 36, className }: { brand: string; label?: string; color?: string; height?: number; className?: string }) {
  const [fileState, setFileState] = useState<'svg' | 'png' | 'none'>(failed.has(brand) ? 'none' : 'svg');
  const width = height * 3;
  const tile = 'flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-black/10';
  const art = ART[brand];

  if (fileState !== 'none' && brand !== 'other' && !brand.startsWith('c_')) {
    return (
      <span className={`${tile} bg-white ${className ?? ''}`} style={{ width, height }}>
        <img src={`/brands/${brand}.${fileState}`} alt={label ?? brand} className="h-[78%] w-[86%] object-contain" draggable={false}
          onError={() => { if (fileState === 'svg') setFileState('png'); else { failed.add(brand); setFileState('none'); } }} />
      </span>
    );
  }
  if (art) {
    return (
      <span className={`${tile} ${className ?? ''}`} style={{ width, height, background: art.bg }} role="img" aria-label={label ?? brand}>
        <svg viewBox="0 0 120 40" width="100%" height="100%" aria-hidden style={{ fontFamily: FONT, fontFeatureSettings: 'normal', fontVariant: 'normal', textTransform: 'none' }}>{art.art}</svg>
      </span>
    );
  }
  // «سایر» and workspace-added brands
  return (
    <span className={`${tile} px-1.5 text-center font-black leading-tight text-white ${className ?? ''}`}
      style={{ width, height, background: color ?? '#5C6B73', fontSize: Math.max(10, height * 0.32) }}>
      <span className="truncate">{label ?? '…'}</span>
    </span>
  );
}
