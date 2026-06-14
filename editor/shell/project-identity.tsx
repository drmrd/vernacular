import './project-identity.css'

interface ProjectIdentityProps {
  name: string
  periodLabel: string | undefined
}

// The rail's project identity block: the project name in EB Garamond with an italic
// period subtitle. It names the artifact rather than labeling a control, so it uses
// the heading face per the design language.
export function ProjectIdentity({ name, periodLabel }: ProjectIdentityProps) {
  return (
    <div className="project-identity">
      <h2 className="project-identity__name">{name}</h2>
      {periodLabel !== undefined ? <p className="project-identity__period">{periodLabel}</p> : null}
    </div>
  )
}
