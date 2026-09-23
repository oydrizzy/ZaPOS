import InterfaceIcon from './InterfaceIcon'

export default function ModuleLoader({ label = 'Cargando datos...' }) {
  return (
    <div
      className="module-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="module-loader-label">
        <span className="app-spinner" aria-hidden="true" />
        {label}
      </div>
      <div className="module-skeleton" aria-hidden="true">
        <div className="skeleton-kpis">
          {[0, 1, 2].map((item) => (
            <div className="skeleton-kpi" key={item}>
              <i />
              <b />
            </div>
          ))}
        </div>
        <div className="skeleton-search" />
        {[0, 1, 2].map((item) => (
          <div className="skeleton-row" key={item}>
            <span />
            <div>
              <i />
              <i />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModuleLoadError({
  title = 'No se pudieron cargar los datos',
  message = 'Revisa tu conexión e inténtalo otra vez.',
  onRetry
}) {
  return (
    <div className="module-load-error" role="alert">
      <InterfaceIcon name="cloudOff" />
      <h2>{title}</h2>
      <p>{message}</p>
      <button className="ghost-btn" type="button" onClick={onRetry}>
        <InterfaceIcon name="refresh" />
        Reintentar
      </button>
    </div>
  )
}
