import type { ReactNode, CSSProperties } from 'react'

export type IconName =
  | 'Home' | 'Folder' | 'FolderOpen' | 'Inbox' | 'Tasks' | 'Sparkles' | 'History' | 'Settings'
  | 'Search' | 'Play' | 'Square' | 'FilePlus' | 'Save' | 'Flask' | 'Shield'
  | 'Book' | 'Branch' | 'Check' | 'X' | 'ChevronRight' | 'ChevronDown' | 'ChevronLeft'
  | 'AlertTriangle' | 'Info' | 'Send' | 'PanelRight' | 'Plus' | 'Code' | 'Clock'
  | 'Star' | 'Bell' | 'Pin' | 'Copy' | 'Pencil' | 'Trash' | 'Link' | 'More'
  | 'Paperclip' | 'Mic' | 'AtSign' | 'Slash' | 'Filter' | 'Eye' | 'Calendar'
  | 'Grip' | 'Globe' | 'Hash' | 'Rocket' | 'Bug' | 'Commit' | 'PullRequest'
  | 'Bot' | 'Ticket' | 'Workflow' | 'Diff' | 'FileCode' | 'Constellation'
  | 'Marketplace' | 'CheckCircle' | 'Logo'
  | 'Sun' | 'Moon' | 'Conversation' | 'Cycle' | 'LayoutGrid' | 'ArrowDownAZ'
  | 'TypeStory' | 'TypeTask' | 'TypeBug' | 'TypeSubtask' | 'TypeSpike'

export interface IconProps {
  name: IconName
  size?: number
  color?: string
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  'aria-hidden'?: boolean
}

const paths: Record<IconName, ReactNode> = {
  Home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></>,
  Folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  FolderOpen: <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>,
  Inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
  Tasks: <><path d="M3 5h13"/><path d="M3 12h13"/><path d="M3 19h13"/><path d="m19 4 1.5 1.5L23 3"/><path d="m19 11 1.5 1.5L23 10"/><path d="m19 18 1.5 1.5L23 17"/></>,
  Sparkles: <><path d="M12 3v3"/><path d="M12 18v3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m4.9 19.1 2.1-2.1"/><path d="m17 7 2.1-2.1"/></>,
  History: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
  Settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  Search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
  Play: <polygon points="6 4 20 12 6 20 6 4"/>,
  Square: <rect x="5" y="5" width="14" height="14" rx="1.5"/>,
  FilePlus: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="M9 15h6"/></>,
  Save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></>,
  Flask: <><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/></>,
  Shield: <><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  Book: <><path d="M2 4a2 2 0 0 1 2-2h6a3 3 0 0 1 3 3v15a2 2 0 0 0-2-2H2z"/><path d="M22 4a2 2 0 0 0-2-2h-6a3 3 0 0 0-3 3v15a2 2 0 0 1 2-2h9z"/></>,
  Branch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
  Check: <polyline points="20 6 9 17 4 12"/>,
  X: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  ChevronRight: <polyline points="9 6 15 12 9 18"/>,
  ChevronDown: <polyline points="6 9 12 15 18 9"/>,
  ChevronLeft: <polyline points="15 6 9 12 15 18"/>,
  AlertTriangle: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  Info: <><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  Send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  PanelRight: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></>,
  Plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  Code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  Clock: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
  Star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
  Bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  Pin: <><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></>,
  Copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  Pencil: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>,
  Trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  Link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  More: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  Paperclip: <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  Mic: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></>,
  AtSign: <><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></>,
  Slash: <line x1="22" y1="2" x2="2" y2="22"/>,
  Filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
  Eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  Calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  Grip: <><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></>,
  Globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  Hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
  Rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>,
  Bug: <><rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2h2l1-2"/></>,
  Commit: <><circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/></>,
  PullRequest: <><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/></>,
  Bot: <><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></>,
  Ticket: <><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></>,
  Workflow: <><rect x="3" y="4" width="6" height="6" rx="1"/><rect x="15" y="4" width="6" height="6" rx="1"/><rect x="9" y="14" width="6" height="6" rx="1"/><path d="M6 10v2h12v-2"/><path d="M12 12v2"/></>,
  Diff: <><path d="M12 3v14"/><path d="M5 10l7-7 7 7"/><path d="M5 21h14"/></>,
  FileCode: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/></>,
  Constellation: <><circle cx="12" cy="12" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="20" cy="6" r="1"/><circle cx="4" cy="18" r="1"/><circle cx="20" cy="18" r="1"/><line x1="12" y1="12" x2="4" y2="6"/><line x1="12" y1="12" x2="20" y2="6"/><line x1="12" y1="12" x2="4" y2="18"/><line x1="12" y1="12" x2="20" y2="18"/></>,
  Marketplace: <><path d="M3 9l1-5h16l1 5"/><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/></>,
  CheckCircle: <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></>,
  /* Theme toggle */
  Sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3m14 0h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12m0-14.14-2.12 2.12m-9.9 9.9-2.12 2.12"/></>,
  Moon: <path d="M21 12.7A8.5 8.5 0 1 1 11.3 3 6.5 6.5 0 0 0 21 12.7z"/>,
  /* Chat / activity */
  Conversation: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></>,
  /* Stats / quick actions */
  Cycle: <><path d="M20 11a8 8 0 1 1-4-7"/><polyline points="20 4 20 11 13 11"/></>,
  LayoutGrid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  ArrowDownAZ: <><path d="M3 16h6m-3-3-3 3 3 3"/><path d="M12 20h7"/><path d="m15 4 4 12"/><path d="M16 12h6"/></>,
  /* Ticket type icons */
  TypeStory: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  TypeTask: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m9 12 2 2 4-4"/></>,
  TypeBug: <><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2"/><path d="M5 7l3 2"/><path d="M19 13h-3"/><path d="M5 13h3"/><path d="M19 19l-3-2"/><path d="M5 19l3-2"/><path d="M12 2v4"/></>,
  TypeSubtask: <><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M21 13v6a2 2 0 0 1-2 2h-6"/><path d="M13 17h6"/></>,
  TypeSpike: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  Logo: null, // handled specially below
}

function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect x="0" y="0" width="64" height="64" rx="4" fill="#1E3A5F"/>
      <rect x="10" y="10" width="14" height="14" rx="1.5" fill="#F59E0B"/>
      <rect x="10" y="28" width="22" height="4" rx="1" fill="#FCD34D"/>
    </svg>
  )
}

export function Icon({
  name,
  size = 16,
  color = 'currentColor',
  className,
  style,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: IconProps) {
  if (name === 'Logo') return <LogoIcon size={size} />

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden ?? !ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {paths[name]}
    </svg>
  )
}
