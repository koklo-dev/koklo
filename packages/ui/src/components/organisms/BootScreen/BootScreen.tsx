import './BootScreen.css'

export interface BootScreenProps {
  /** Status label shown left of the project name (default: "Opening") */
  status?: string
  /** Project name shown in the status line */
  projectName?: string
  /** Version string shown in bottom-right chrome (e.g. "v 0.8.2") */
  version?: string
  /** Build string shown in bottom-right chrome (e.g. "build 2026.05.14") */
  build?: string
  /** When true, hides the loading bar and stops the dots animation */
  loaded?: boolean
}

export function BootScreen({
  status = 'Opening',
  projectName,
  version,
  build,
  loaded = false,
}: BootScreenProps) {
  const hasChromeBR = version || build
  const chromeLabel = [version, build].filter(Boolean).join(' · ')

  return (
    <div
      className={`kk-bs${loaded ? ' kk-bs--loaded' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!loaded}
      data-screen-label="01 Boot"
    >
      <div className="kk-bs-dawn" aria-hidden="true" />
      <div className="kk-bs-grain" aria-hidden="true" />

      <div className="kk-bs-stack">
        <div className="kk-bs-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="0" y="0" width="64" height="64" rx="6" fill="#1E3A5F" />
            <rect x="10" y="10" width="14" height="14" rx="1.5" fill="#F59E0B" />
            <rect x="10" y="28" width="22" height="4" rx="1" fill="#FCD34D" />
          </svg>
        </div>

        <h1 className="kk-bs-wordmark">Koklo</h1>

        <div className="kk-bs-status">
          <span className="kk-bs-status-label">{status}</span>
          {projectName && (
            <span className="kk-bs-status-project">{projectName}</span>
          )}
          <span className="kk-bs-dots" aria-hidden="true" />
        </div>

        {!loaded && <div className="kk-bs-bar" aria-label="Loading" />}
      </div>

      <div className="kk-bs-chrome-bl" aria-hidden="true">
        <span className="kk-bs-dot" />
        <span>tauri runtime</span>
      </div>

      {hasChromeBR && (
        <div className="kk-bs-chrome-br" aria-hidden="true">
          {chromeLabel}
        </div>
      )}
    </div>
  )
}
