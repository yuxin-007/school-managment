import type { CSSProperties, ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
}

interface PageHeroProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

interface MetricGridProps {
  children: ReactNode
}

interface MetricCardProps {
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
  accent?: string
  actionLabel?: string
  onActivate?: () => void
}

const metricStyle = (accent?: string) =>
  (accent ? { '--metric-accent': accent } : undefined) as CSSProperties | undefined

export const PageShell = ({ children }: PageShellProps) => <div className="page-shell">{children}</div>

export const PageHero = ({ eyebrow, title, description, actions }: PageHeroProps) => (
  <section className="page-hero" aria-labelledby="page-title">
    {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
    <h2 id="page-title" className="page-title">
      {title}
    </h2>
    {description ? <p className="page-description">{description}</p> : null}
    {actions ? <div className="page-actions">{actions}</div> : null}
  </section>
)

export const MetricGrid = ({ children }: MetricGridProps) => <div className="metrics-grid">{children}</div>

export const MetricCard = ({ label, value, icon, accent, actionLabel, onActivate }: MetricCardProps) => {
  const content = (
    <>
      <span className="metric-label">{label}</span>
      <span className="metric-card-main">
        {icon ? (
          <span className="metric-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="metric-value">{value}</span>
      </span>
    </>
  )

  if (onActivate) {
    return (
      <button
        type="button"
        className="metric-card metric-card-action"
        style={metricStyle(accent)}
        aria-label={actionLabel}
        onClick={onActivate}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="metric-card" style={metricStyle(accent)}>
      {content}
    </div>
  )
}
