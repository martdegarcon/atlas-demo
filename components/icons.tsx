import type { ReactNode } from "react"

type P = { className?: string; size?: number; strokeWidth?: number | string }

function Icon({ children, className, size = 20, strokeWidth = 1.75 }: P & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const MagnifyingGlassIcon = (p: P) => <Icon {...p}><circle cx="10.2" cy="10.2" r="6.2" /><line x1="14.8" y1="14.8" x2="20" y2="20" /></Icon>
export const PlusIcon = (p: P) => <Icon {...p}><line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" /></Icon>
export const CaretLeftIcon = (p: P) => <Icon {...p}><polyline points="15 5 8 12 15 19" /></Icon>
export const CaretRightIcon = (p: P) => <Icon {...p}><polyline points="9 5 16 12 9 19" /></Icon>
export const CaretUpIcon = (p: P) => <Icon {...p}><polyline points="5 15 12 8 19 15" /></Icon>
export const CaretDownIcon = (p: P) => <Icon {...p}><polyline points="5 9 12 16 19 9" /></Icon>
export const XIcon = (p: P) => <Icon {...p}><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></Icon>
export const ShareIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="18" cy="6" r="2.3" /><circle cx="18" cy="18" r="2.3" /><circle cx="6" cy="12" r="2.3" />
    <line x1="8.1" y1="10.9" x2="15.9" y2="7.1" /><line x1="8.1" y1="13.1" x2="15.9" y2="16.9" />
  </Icon>
)
export const MapPinIcon = (p: P) => <Icon {...p}><path d="M12 21s-7-7.1-7-12a7 7 0 0 1 14 0c0 4.9-7 12-7 12z" /><circle cx="12" cy="9" r="2.3" /></Icon>
export const LinkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9.5 14.5l5-5" />
    <path d="M8 16.5l-1.5 1.5a3.5 3.5 0 0 1-5-5L3 11.5a3.5 3.5 0 0 1 5-5L9.5 5" />
    <path d="M16 7.5l1.5-1.5a3.5 3.5 0 0 1 5 5L21 12.5a3.5 3.5 0 0 1-5 5L14.5 19" />
  </Icon>
)
export const GlobeIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3" y1="12" x2="21" y2="12" /></Icon>
export const PathIcon = (p: P) => <Icon {...p}><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M6.6 16.7C10 13 8 9 11.5 7s6-1 6-1" /></Icon>
export const NoteIcon = (p: P) => <Icon {...p}><path d="M5 19h14" /><path d="M6 14.5V17h2.5L17 8.5a1.77 1.77 0 0 0-2.5-2.5L6 14.5z" /></Icon>
export const DotsIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="8.3" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.7" cy="12" r="1.15" fill="currentColor" stroke="none" />
  </Icon>
)
export const PencilIcon = (p: P) => <Icon {...p}><path d="M4 20h4L19 9a2.12 2.12 0 0 0-3-3L5 17z" /><line x1="14" y1="8" x2="17" y2="11" /></Icon>
export const TrashIcon = (p: P) => <Icon {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Icon>
export const ImageIcon = (p: P) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5L5 19" /></Icon>
export const DownloadIcon = (p: P) => <Icon {...p}><path d="M12 4v11" /><polyline points="7 10 12 15 17 10" /><path d="M5 20h14" /></Icon>
export const UploadIcon = (p: P) => <Icon {...p}><path d="M12 16V5" /><polyline points="7 10 12 5 17 10" /><path d="M5 20h14" /></Icon>
export const LockIcon = (p: P) => <Icon {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>
export const FilmIcon = (p: P) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" /></Icon>
export const CardIcon = (p: P) => <Icon {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 15l3-4 2 2 3-4" /></Icon>
export const CopyIcon = (p: P) => <Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></Icon>
