import type { SVGProps } from 'react'

export type ArtworkKind = 'boat' | 'animal' | 'family' | 'nature'

interface Props extends SVGProps<SVGSVGElement> {
  kind?: ArtworkKind
}

const PAPER = '#fffdf6'

/**
 * 演示用儿童画作（代码绘制的柔和水彩/蜡笔风占位图）。
 * 真实账号有历史画作时，页面会用服务器上的真实作品图替换。
 */
export function ChildArtwork({ kind, ...props }: Props) {
  switch (kind) {
    case 'boat':
      return <BoatArtwork {...props} />
    case 'animal':
      return <AnimalArtwork {...props} />
    case 'family':
      return <FamilyArtwork {...props} />
    case 'nature':
      return <NatureArtwork {...props} />
    default:
      return (
        <svg viewBox="0 0 220 220" {...props}>
          <rect width="220" height="220" fill={PAPER} />
          <path
            d="M60 150q34-70 106-76"
            stroke="#d8cfba"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="150" cy="82" r="3.4" fill="#e6dcc4" />
          <circle cx="74" cy="142" r="3.4" fill="#e6dcc4" />
        </svg>
      )
  }
}

function BoatArtwork(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 220 220" {...props}>
      <rect width="220" height="220" fill={PAPER} />
      <rect width="220" height="118" fill="#dcebf3" opacity=".55" />
      <rect y="116" width="220" height="104" fill="#cfe6dc" opacity=".7" />
      <circle cx="176" cy="42" r="21" fill="#f7e3ab" opacity=".95" />
      <path d="M150 88h16v-8l4 10 4-10v8h16" fill="#ffffff" opacity=".9" />
      <path d="M176 34c-9-14-24-12-30-4 5-4 17-4 24 5z" fill="#fff" opacity=".7" />
      <ellipse cx="176" cy="124" rx="34" ry="12" fill="#b7cba6" opacity=".8" />
      <path d="M34 168q10 8 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0" stroke="#6fa5b8" strokeWidth="2.6" fill="none" opacity=".7" strokeLinecap="round" />
      <path d="M40 182q10 7 20 0t20 0 20 0 20 0 20 0 20 0 20 0" stroke="#5f948a" strokeWidth="2.2" fill="none" opacity=".6" strokeLinecap="round" />
      <path d="M46 198q10 6 20 0t20 0 20 0" stroke="#6fa5b8" strokeWidth="2" fill="none" opacity=".5" strokeLinecap="round" />
      <path d="m58 152 92 0-9 18-76 0z" fill="#c68a58" stroke="#8a5a34" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M106 150v-54" stroke="#7d6a58" strokeWidth="3" strokeLinecap="round" />
      <path d="M104 98 134 142l-30 7Z" fill="#f0c98c" stroke="#c9a04a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M108 106 80 142l28 6Z" fill="#e9a894" stroke="#c9745c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M104 92l10-16" stroke="#c9a04a" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="150" cy="66" r="1.6" fill="#6b7a64" />
      <circle cx="162" cy="58" r="1.6" fill="#6b7a64" />
      <circle cx="139" cy="60" r="1.4" fill="#6b7a64" opacity=".8" />
      <path d="M44 84c3-8 8-12 15-12M40 96c2-5 5-8 10-8" stroke="#9bb6c4" strokeWidth="2" fill="none" opacity=".8" strokeLinecap="round" />
    </svg>
  )
}

function AnimalArtwork(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 220 220" {...props}>
      <rect width="220" height="220" fill={PAPER} />
      <rect y="148" width="220" height="72" fill="#dcebd0" opacity=".75" />
      <circle cx="182" cy="36" r="16" fill="#f7e3ab" opacity=".95" />
      <path d="M18 60h30M33 45v30" stroke="#7da463" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      <path d="M52 70q10 6 20 0t20 0 20 0" stroke="#7da463" strokeWidth="2.2" fill="none" opacity=".7" strokeLinecap="round" />
      <path d="M66 158q16-10 36-10t36 10" stroke="#5f8a4e" strokeWidth="2.6" fill="none" opacity=".7" strokeLinecap="round" />
      <path d="M110 118v-14" stroke="#5f8a4e" strokeWidth="2.4" strokeLinecap="round" opacity=".6" />
      <path d="M70 130q-20-4-30 10" stroke="#b98c59" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M150 130q20-4 30 10" stroke="#b98c59" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M110 64c-7-20-22-28-34-22 10-2 22 6 30 22Z" fill="#f2b67f" stroke="#c98248" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M110 64c7-20 22-28 34-22-10-2-22 6-30 22Z" fill="#f2b67f" stroke="#c98248" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="110" cy="72" r="42" fill="#f2b67f" stroke="#c98248" strokeWidth="2.4" />
      <ellipse cx="110" cy="118" rx="32" ry="24" fill="#efb27a" stroke="#c98248" strokeWidth="2.2" />
      <path d="M92 128v20M110 130v22M128 128v20" stroke="#c98248" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M154 150c14-2 24-12 26-28" stroke="#efb27a" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M154 150c14-2 24-12 26-28" stroke="#c98248" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="96" cy="72" r="3.4" fill="#4d3c2c" />
      <circle cx="124" cy="72" r="3.4" fill="#4d3c2c" />
      <path d="M108 86h4l-2 5z" fill="#c9745c" />
      <path d="M110 92c4 4 0 8-6 9 5 1 8 3 9 6" stroke="#4d3c2c" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M86 58q-10-2-14 6M84 76q-11 0-12 10M134 58q10-2 14 6M136 76q11 0 12 10" stroke="#c98248" strokeWidth="1.8" fill="none" opacity=".8" strokeLinecap="round" />
      <circle cx="42" cy="178" r="5" fill="#e8a1b0" />
      <circle cx="176" cy="186" r="4.6" fill="#e8a1b0" />
      <path d="M34 196q6-3 10 2M168 196q6-3 10 2" stroke="#4d3c2c" strokeWidth="1.8" strokeLinecap="round" opacity=".6" />
    </svg>
  )
}

function FamilyArtwork(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 220 220" {...props}>
      <rect width="220" height="220" fill={PAPER} />
      <rect width="220" height="110" fill="#f6ecd7" opacity=".6" />
      <rect y="150" width="220" height="70" fill="#dcebd0" opacity=".8" />
      <circle cx="40" cy="42" r="18" fill="#f7e3ab" opacity=".95" />
      <path d="M150 66a24 24 0 0 1 34-6 26 26 0 0 1 12 34 26 26 0 0 1-46-28Z" fill="#fff" opacity=".92" />
      <path d="M150 60a22 22 0 0 1 40-8" stroke="#d9e6ea" strokeWidth="10" strokeLinecap="round" opacity=".9" />
      <path d="M44 150v30M176 150v30" stroke="#7da463" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".7" />
      <circle cx="110" cy="74" r="20" fill="#f5d9a4" stroke="#c9a04a" strokeWidth="2.2" />
      <path d="M100 74c0-9 22-9 22 0v8H100Z" fill="#8a5a34" opacity=".85" />
      <circle cx="104" cy="74" r="1.7" fill="#4d3c2c" />
      <circle cx="116" cy="74" r="1.7" fill="#4d3c2c" />
      <path d="M104 80q6 6 12 0" stroke="#8a5a34" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="60" cy="100" r="17" fill="#f3cdb1" stroke="#c9805c" strokeWidth="2.2" />
      <path d="M52 100c0-8 18-8 18 0v6H52Z" fill="#4d3c2c" />
      <circle cx="55" cy="100" r="1.6" fill="#4d3c2c" />
      <circle cx="65" cy="100" r="1.6" fill="#4d3c2c" />
      <path d="M55 107q5 5 10 0" stroke="#c9805c" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="160" cy="100" r="17" fill="#f5d9a4" stroke="#c9a04a" strokeWidth="2.2" />
      <path d="M152 100c0-8 18-8 18 0v6h-18Z" fill="#6b5a4a" />
      <circle cx="155" cy="100" r="1.6" fill="#4d3c2c" />
      <circle cx="165" cy="100" r="1.6" fill="#4d3c2c" />
      <path d="M155 108q5 4 10 0" stroke="#c9a04a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M48 116h24v44H48Z" fill="#8fb9d8" stroke="#5f8fb0" strokeWidth="2.2" />
      <path d="M100 96h20v52h-20Z" fill="#efb27a" stroke="#c98248" strokeWidth="2.2" />
      <path d="M148 116h24v44h-24Z" fill="#a9c68a" stroke="#739d58" strokeWidth="2.2" />
      <path d="M70 132q30 18 80 0" stroke="#c98248" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M70 132l-10 22 34-6M150 132l10 22-34-6" stroke="#5f8fb0" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
      <path d="M76 156l-4-9M62 164l-2 8M152 156l4-9M166 164l2 8" stroke="#4d3c2c" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M50 196h18v18H50ZM98 192h24v22H98ZM152 196h18v18h-18Z" fill="#8a5a34" stroke="#6b4a2c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M196 52c2-7 8-11 14-13-6-2-10-7-12-13-2 6-8 11-14 13 6 2 10 7 12 13Z" fill="#e8a1b0" opacity=".85" />
    </svg>
  )
}

function NatureArtwork(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 220 220" {...props}>
      <rect width="220" height="220" fill={PAPER} />
      <rect width="220" height="108" fill="#e4f0f6" opacity=".6" />
      <rect y="160" width="220" height="60" fill="#dcebd0" opacity=".85" />
      <circle cx="180" cy="44" r="20" fill="#f7e3ab" opacity=".96" />
      <path d="M172 112a22 22 0 0 1 30-8 24 24 0 0 1 14 30 24 24 0 0 1-44-22Z" fill="#fff" opacity=".95" />
      <path d="M40 60q20 4 34-2M44 74q16 4 30-2" stroke="#f0a8a0" strokeWidth="4.6" fill="none" opacity=".55" strokeLinecap="round" />
      <path d="M52 82q18 4 30-2" stroke="#e2c25f" strokeWidth="4.6" fill="none" opacity=".55" strokeLinecap="round" />
      <path d="M64 96q14 3 24-2" stroke="#8fb9a0" strokeWidth="4.4" fill="none" opacity=".5" strokeLinecap="round" />
      <path d="M62 128h56v8l-6 52H68l-6-52Z" fill="#b98c59" stroke="#8a6438" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="90" cy="84" r="30" fill="#a9c68a" stroke="#7a9a5e" strokeWidth="2.2" />
      <circle cx="122" cy="90" r="24" fill="#bcd6a0" stroke="#7a9a5e" strokeWidth="2" />
      <circle cx="72" cy="104" r="22" fill="#8fb273" stroke="#5f8a4e" strokeWidth="2" />
      <circle cx="112" cy="72" r="20" fill="#c3dcab" stroke="#7a9a5e" strokeWidth="2" />
      <circle cx="84" cy="88" r="2.8" fill="#e0706a" opacity=".85" />
      <circle cx="120" cy="100" r="2.6" fill="#e0706a" opacity=".85" />
      <circle cx="96" cy="76" r="2.4" fill="#e8a04c" opacity=".9" />
      <path d="M16 166q8-3 12 2M188 170q8-3 12 2" stroke="#5f8a4e" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
      <circle cx="34" cy="178" r="5" fill="#e8a1b0" />
      <path d="M28 190q5-2 9 2M32 184v14" stroke="#4d3c2c" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
      <circle cx="196" cy="188" r="4.6" fill="#f0c98c" />
      <path d="M192 198q4-1 7 1" stroke="#4d3c2c" strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
      <path d="M48 172v18M40 181h16" stroke="#c9745c" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
      <path d="M142 174v16M134 182h16" stroke="#c9745c" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
      <path d="M156 120l3-8M168 116l2-8" stroke="#9bb6c4" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
    </svg>
  )
}

