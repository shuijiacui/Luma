import type { SVGProps } from 'react'

function base(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    ...props,
  }
}

export function SproutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8Z" />
      <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2Z" />
    </svg>
  )
}

export function RecordsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2.4" />
      <circle cx="8.6" cy="8.6" r="1.8" />
      <path d="m21 15.2-2.8-2.8a1.9 1.9 0 0 0-2.7 0L6.4 21.5" />
    </svg>
  )
}

export function CompassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="m15.9 8.1-1.9 5.9-5.9 1.9 1.9-5.9 5.9-1.9Z" />
    </svg>
  )
}

export function TimelineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 3.5v5h5" />
      <path d="M3.8 13.5a8.5 8.5 0 1 0 2.7-7.6L3.5 8.5" />
      <path d="M12 7.5v5l3.6 2.2" />
    </svg>
  )
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M20.5 12.2a7.6 7.6 0 0 1-8 7.6 8.6 8.6 0 0 1-3.4-.7L4 20l1-4.6a7.4 7.4 0 0 1-1.5-4.6 7.6 7.6 0 0 1 8-7.6 7.6 7.6 0 0 1 9 9Z" />
      <path d="M8.2 11.2h7.6M8.2 14.2h4.8" />
    </svg>
  )
}

export function FamilyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M16.5 20.5v-1.8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1.8" />
      <circle cx="9" cy="7.2" r="3.4" />
      <path d="M21 20.5v-1.8a4 4 0 0 0-3-3.9" />
      <path d="M15.6 3.9a3.4 3.4 0 0 1 0 6.6" />
    </svg>
  )
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M18.2 9.6a6.2 6.2 0 0 0-12.4 0c0 6.2-2.6 7.6-2.6 7.6h17.6s-2.6-1.4-2.6-7.6Z" />
      <path d="M10 20.6a2.2 2.2 0 0 0 4 0" />
    </svg>
  )
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  )
}

export function LeafIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M11 20A7.3 7.3 0 0 1 9.6 6C15.4 4.9 17 4.4 19 2c1.2 2.2 2.2 4.6 2.2 8.2C21.2 15.6 16.7 20 11 20Z" />
      <path d="M2 21.5c0-3.2 1.9-5.6 5.3-6.3 2.5-.5 5-2 6.2-3.2" />
    </svg>
  )
}

export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

export function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="5.5" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5c.6 3.9 1.9 5.9 5.9 6.5-4 .6-5.3 2.6-5.9 6.5-.6-3.9-1.9-5.9-5.9-6.5 4-.6 5.3-2.6 5.9-6.5Z" />
      <path d="M18.6 15.6c.3 1.9.9 2.8 2.8 3.1-1.9.3-2.5 1.2-2.8 3.1-.3-1.9-1-2.8-2.8-3.1 1.8-.3 2.5-1.2 2.8-3.1Z" />
    </svg>
  )
}

export function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 20.2C6.4 16.8 3.5 13.5 3.5 9.8 3.5 7 5.7 4.8 8.4 4.8c1.5 0 2.9.7 3.6 1.9a4.2 4.2 0 0 1 3.6-1.9c2.7 0 4.9 2.2 4.9 5 0 3.7-2.9 7-8.5 10.4Z" />
    </svg>
  )
}
