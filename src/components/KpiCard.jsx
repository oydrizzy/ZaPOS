import InterfaceIcon from './InterfaceIcon'

export default function KpiCard({
  icon,
  label,
  value,
  caption,
  tone = 'default'
}) {
  return (
    <div className={`stat-card inventory-stat kpi-${tone}`}>
      <div className="inventory-stat-heading">
        <span className="inventory-stat-icon">
          <InterfaceIcon name={icon} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="inventory-stat-caption">{caption}</span>
    </div>
  )
}
