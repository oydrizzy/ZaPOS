import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createNote,
  deleteNote,
  getNotes,
  updateNote
} from '../services/notesService'
import './notes.css'
import ModuleLoader from './ModuleLoader'

const priorityLabels = {
  normal: 'Normal',
  importante: 'Importante',
  urgente: 'Urgente'
}
const relationLabels = {
  producto: 'Producto',
  cliente: 'Cliente',
  deuda: 'Deuda',
  venta: 'Venta',
  caja: 'Movimiento'
}
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString('es-DO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : ''
const blankNote = () => ({
  title: '',
  description: '',
  priority: 'normal',
  status: 'pendiente',
  pinned: false,
  noteDate: '',
  relationType: '',
  relationId: ''
})

function Icon({ children }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {children}
    </span>
  )
}

function localDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function matchesDate(value, filter) {
  if (filter === 'all') return true
  if (filter === 'none') return !value
  if (!value) return false
  const date = new Date(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(today)
  end.setDate(
    end.getDate() + (filter === 'week' ? 7 : filter === 'tomorrow' ? 2 : 1)
  )
  const start = new Date(today)
  if (filter === 'tomorrow') start.setDate(start.getDate() + 1)
  return filter === 'overdue' ? date < today : date >= start && date < end
}

export default function NotesModule({
  products,
  debts,
  transactions,
  notify,
  onOpenRelation
}) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [date, setDate] = useState('all')
  const [sort, setSort] = useState('recent')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(null)
  const [original, setOriginal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const dialog = useRef(null)
  const active = useRef(true)
  const closeEditorRef = useRef(null)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    getNotes()
      .then((data) => {
        if (current) setNotes(data)
      })
      .catch((failure) => {
        if (current)
          setError(failure.message || 'No se pudieron cargar tus notas.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [reload])

  const relations = useMemo(
    () => [
      ...products.map((p) => ({
        type: 'producto',
        id: p.id,
        label: `${p.name} (${p.type || 'Hybrida'})`
      })),
      ...debts.map((d) => ({
        type: 'deuda',
        id: d.id,
        label: `${d.customerName || 'Cliente'} · Deuda #${d.id}`
      })),
      ...transactions.map((t) => ({
        type: ['income', 'expense'].includes(t.type) ? 'caja' : 'venta',
        id: t.id,
        label: `#${t.id} · ${t.note || (t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Egreso' : 'Venta')}`
      }))
    ],
    [products, debts, transactions]
  )

  const relationLabel = (note) =>
    relations.find(
      (r) =>
        r.type === note.relationType && String(r.id) === String(note.relationId)
    )?.label ||
    (note.relationType
      ? `${relationLabels[note.relationType] || note.relationType}${note.relationId ? ` #${note.relationId}` : ''}`
      : '')
  const counts = {
    all: notes.length,
    pendiente: notes.filter((n) => n.status === 'pendiente').length,
    completada: notes.filter((n) => n.status === 'completada').length
  }
  const filtered = notes
    .filter(
      (note) =>
        (status === 'all' || note.status === status) &&
        (priority === 'all' || note.priority === priority) &&
        matchesDate(note.noteDate, date) &&
        normalize(
          `${note.title} ${note.description} ${relationLabel(note)}`
        ).includes(normalize(query.trim()))
    )
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sort === 'priority') {
        const rank = { urgente: 3, importante: 2, normal: 1 }
        const difference = rank[b.priority] - rank[a.priority]
        if (difference) return difference
      }
      if (sort === 'date') {
        const difference =
          (a.noteDate ? new Date(a.noteDate).getTime() : Infinity) -
          (b.noteDate ? new Date(b.noteDate).getTime() : Infinity)
        if (difference && !Number.isNaN(difference)) return difference
      }
      return sort === 'oldest'
        ? new Date(a.createdAt) - new Date(b.createdAt)
        : new Date(b.updatedAt || b.createdAt) -
            new Date(a.updatedAt || a.createdAt)
    })
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * 12, currentPage * 12)
  const hasFilters =
    query ||
    status !== 'all' ||
    priority !== 'all' ||
    date !== 'all' ||
    sort !== 'recent'
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(original)

  useEffect(() => {
    setPage(1)
  }, [query, status, priority, date, sort])
  useEffect(() => {
    if (!dirty) return undefined
    const preventLeave = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventLeave)
    return () => window.removeEventListener('beforeunload', preventLeave)
  }, [dirty])

  const closeEditor = () => {
    if (saving.current) return
    if (dirty) setConfirm({ kind: 'discard' })
    else setDraft(null)
  }
  closeEditorRef.current = closeEditor

  // Keep keyboard focus inside the editor, including its confirmation view.
  useEffect(() => {
    if (!draft && !confirm) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const initialFocus =
      dialog.current?.querySelector('[data-note-initial-focus]') ||
      dialog.current?.querySelector('input, button')
    initialFocus?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!saving.current) {
          if (confirm) setConfirm(null)
          else closeEditorRef.current()
        }
      }
      if (event.key !== 'Tab') return
      const focusable = [
        ...(dialog.current?.querySelectorAll(
          'button:not(:disabled), input, textarea, select, [tabindex="0"]'
        ) || [])
      ].filter((element) => !element.matches(':disabled'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !focusable.includes(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [Boolean(draft), confirm])

  const openEditor = (note = blankNote()) => {
    setOriginal({ ...note })
    setDraft({ ...note })
  }
  const change = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const run = async (operation, message, after) => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const saved = await operation()
      if (!active.current) return
      after(saved)
      notify(message)
    } catch (failure) {
      if (active.current)
        notify(failure.message || 'No se pudo guardar el cambio.', 'error')
    } finally {
      saving.current = false
      if (active.current) setBusy(false)
    }
  }
  const replaceNote = (saved) =>
    setNotes((current) =>
      current.map((note) => (note.id === saved.id ? saved : note))
    )
  const toggle = (note, field) => {
    const next = {
      ...note,
      [field]:
        field === 'pinned'
          ? !note.pinned
          : note.status === 'completada'
            ? 'pendiente'
            : 'completada'
    }
    run(
      () => updateNote(note.id, next),
      field === 'pinned'
        ? next.pinned
          ? 'Nota fijada'
          : 'Nota desfijada'
        : next.status === 'completada'
          ? 'Nota completada'
          : 'Nota pendiente',
      replaceNote
    )
  }
  const save = (event) => {
    event.preventDefault()
    if (!draft.title.trim()) {
      notify('Escribe un título para la nota.', 'error')
      return
    }
    const payload = { ...draft, title: draft.title.trim() }
    run(
      () => (draft.id ? updateNote(draft.id, payload) : createNote(payload)),
      draft.id ? 'Nota actualizada' : 'Nota creada',
      (saved) => {
        if (draft.id) replaceNote(saved)
        else setNotes((current) => [saved, ...current])
        setDraft(null)
      }
    )
  }

  return (
    <section className="notes-shell" aria-labelledby="notes-heading">
      <header className="notes-heading">
        <div>
          <h1 id="notes-heading">Notas</h1>
          <p>
            {counts.pendiente} pendientes · {counts.completada} completadas
          </p>
        </div>
        <button
          className="primary-btn notes-create"
          type="button"
          onClick={() => openEditor()}
          disabled={loading || !!error}
        >
          <Icon>edit_square</Icon>Nueva nota
        </button>
      </header>
      <div className="notes-toolbar">
        <label className="notes-search">
          <Icon>search</Icon>
          <input
            aria-label="Buscar notas"
            placeholder="Buscar en tus notas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setQuery('')}
            >
              <Icon>close</Icon>
            </button>
          )}
        </label>
        <button
          className={`notes-tool ${filtersOpen || priority !== 'all' || date !== 'all' || sort !== 'recent' ? 'is-active' : ''}`}
          type="button"
          title="Filtrar notas"
          aria-label="Filtrar notas"
          aria-expanded={filtersOpen}
          aria-controls="notes-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icon>tune</Icon>
        </button>
      </div>
      <div className="notes-tabs" aria-label="Estado de las notas">
        {[
          ['all', 'Todas'],
          ['pendiente', 'Pendientes'],
          ['completada', 'Completadas']
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={status === value}
            className={status === value ? 'is-active' : ''}
            onClick={() => setStatus(value)}
          >
            {label}
            <span>{counts[value]}</span>
          </button>
        ))}
      </div>
      {filtersOpen && (
        <div id="notes-filters" className="notes-filters">
          <label>
            Prioridad
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="all">Todas</option>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              {[
                ['all', 'Cualquier fecha'],
                ['today', 'Hoy'],
                ['tomorrow', 'Mañana'],
                ['week', 'Próximos 7 días'],
                ['overdue', 'Vencidas'],
                ['none', 'Sin fecha']
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Orden
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {[
                ['recent', 'Más recientes'],
                ['oldest', 'Más antiguas'],
                ['priority', 'Prioridad'],
                ['date', 'Fecha más cercana']
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {loading ? (
        <ModuleLoader label="Cargando notas..." />
      ) : error ? (
        <div className="notes-empty" role="alert">
          <Icon>cloud_off</Icon>
          <h2>No se pudieron cargar las notas</h2>
          <p>{error}</p>
          <button
            className="ghost-btn"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : !filtered.length ? (
        <div className="notes-empty">
          <Icon>{hasFilters ? 'search_off' : 'sticky_note_2'}</Icon>
          <h2>
            {hasFilters ? 'Sin resultados' : 'Tus notas, en un solo lugar'}
          </h2>
          {hasFilters ? (
            <button
              className="ghost-btn"
              onClick={() => {
                setQuery('')
                setStatus('all')
                setPriority('all')
                setDate('all')
                setSort('recent')
              }}
            >
              Limpiar filtros
            </button>
          ) : (
            <button className="ghost-btn" onClick={() => openEditor()}>
              Crear primera nota
            </button>
          )}
        </div>
      ) : (
        <>
          {[true, false].map((pinned) => {
            const group = visible.filter((note) => note.pinned === pinned)
            return (
              group.length > 0 && (
                <section
                  className="notes-group"
                  key={String(pinned)}
                  aria-label={pinned ? 'Notas fijadas' : 'Otras notas'}
                >
                  <h2>
                    <Icon>{pinned ? 'push_pin' : 'notes'}</Icon>
                    {pinned ? 'Fijadas' : 'Mis notas'}
                  </h2>
                  <ul className="notes-list">
                    {group.map((note) => (
                      <li
                        className={`note-row ${note.status === 'completada' ? 'is-complete' : ''}`}
                        key={note.id}
                      >
                        <button
                          className="note-copy"
                          type="button"
                          onClick={() => openEditor(note)}
                          aria-label={`Abrir nota: ${note.title}`}
                        >
                          <span className="note-title">{note.title}</span>
                          <span className="note-preview">
                            {note.description || 'Sin contenido'}
                          </span>
                          <span className="note-meta">
                            <time
                              dateTime={
                                note.noteDate ||
                                note.updatedAt ||
                                note.createdAt
                              }
                            >
                              {dateLabel(
                                note.noteDate ||
                                  note.updatedAt ||
                                  note.createdAt
                              )}
                            </time>
                            {note.priority !== 'normal' && (
                              <span
                                className={`note-priority priority-${note.priority}`}
                              >
                                <Icon>flag</Icon>
                                {priorityLabels[note.priority]}
                              </span>
                            )}
                            <span
                              className={`note-status status-${note.status}`}
                            >
                              <Icon>
                                {note.status === 'completada'
                                  ? 'check_circle'
                                  : 'schedule'}
                              </Icon>
                              {note.status === 'completada'
                                ? 'Completada'
                                : 'Pendiente'}
                            </span>
                          </span>
                        </button>
                        <div className="note-quick-actions">
                          <button
                            className={`notes-tool ${note.pinned ? 'is-active' : ''}`}
                            type="button"
                            title={note.pinned ? 'Desfijar nota' : 'Fijar nota'}
                            aria-label={
                              note.pinned ? 'Desfijar nota' : 'Fijar nota'
                            }
                            aria-pressed={note.pinned}
                            disabled={busy}
                            onClick={() => toggle(note, 'pinned')}
                          >
                            <Icon>push_pin</Icon>
                          </button>
                          <button
                            className="notes-tool"
                            type="button"
                            title={
                              note.status === 'completada'
                                ? 'Marcar pendiente'
                                : 'Completar nota'
                            }
                            aria-label={
                              note.status === 'completada'
                                ? 'Marcar pendiente'
                                : 'Completar nota'
                            }
                            disabled={busy}
                            onClick={() => toggle(note, 'status')}
                          >
                            <Icon>
                              {note.status === 'completada' ? 'undo' : 'check'}
                            </Icon>
                          </button>
                        </div>
                        {note.relationType && (
                          <button
                            type="button"
                            className="note-relation"
                            onClick={() => onOpenRelation(note)}
                          >
                            <Icon>link</Icon>
                            <span>{relationLabel(note)}</span>
                            <Icon>arrow_outward</Icon>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            )
          })}
          <footer className="notes-pagination">
            <span>
              {filtered.length} {filtered.length === 1 ? 'nota' : 'notas'}
            </span>
            {totalPages > 1 && (
              <div>
                <button
                  className="notes-tool"
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <Icon>chevron_left</Icon>
                </button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <button
                  className="notes-tool"
                  aria-label="Página siguiente"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <Icon>chevron_right</Icon>
                </button>
              </div>
            )}
          </footer>
        </>
      )}
      {(draft || confirm) &&
        createPortal(
          <div
            className="notes-overlay"
            onClick={() => {
              if (!busy) {
                if (confirm) setConfirm(null)
                else closeEditor()
              }
            }}
          >
            {confirm ? (
              <section
                ref={dialog}
                className="notes-confirm"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="note-confirm-title"
                aria-describedby="note-confirm-body"
                onClick={(e) => e.stopPropagation()}
              >
                <Icon>
                  {confirm.kind === 'delete' ? 'delete' : 'edit_note'}
                </Icon>
                <h2 id="note-confirm-title">
                  {confirm.kind === 'delete'
                    ? '¿Eliminar esta nota?'
                    : '¿Descartar los cambios?'}
                </h2>
                <p id="note-confirm-body">
                  {confirm.kind === 'delete'
                    ? 'La nota se eliminará permanentemente.'
                    : 'Los cambios sin guardar se perderán.'}
                </p>
                <div>
                  <button
                    className="ghost-btn"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="danger-btn"
                    disabled={busy}
                    onClick={() => {
                      if (confirm.kind === 'discard') {
                        setDraft(null)
                        setConfirm(null)
                      } else
                        run(
                          () => deleteNote(draft.id),
                          'Nota eliminada',
                          () => {
                            setNotes((current) =>
                              current.filter((n) => n.id !== draft.id)
                            )
                            setDraft(null)
                            setConfirm(null)
                          }
                        )
                    }}
                  >
                    {busy
                      ? 'Eliminando...'
                      : confirm.kind === 'delete'
                        ? 'Eliminar'
                        : 'Descartar'}
                  </button>
                </div>
              </section>
            ) : (
              <form
                ref={dialog}
                className="note-editor"
                role="dialog"
                aria-modal="true"
                aria-labelledby="note-editor-heading"
                onSubmit={save}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="note-editor-bar">
                  <span className="note-editor-heading-icon">
                    <Icon>edit_note</Icon>
                  </span>
                  <h2
                    id="note-editor-heading"
                    tabIndex={-1}
                    data-note-initial-focus
                  >
                    {draft.id ? 'Editar nota' : 'Nueva nota'}
                  </h2>
                  <button
                    className="notes-tool"
                    type="button"
                    title="Cerrar nota"
                    aria-label="Cerrar nota"
                    disabled={busy}
                    onClick={closeEditor}
                  >
                    <Icon>close</Icon>
                  </button>
                </header>
                <fieldset disabled={busy} className="note-editor-body">
                  <label className="note-editor-label" htmlFor="note-title">
                    Título
                  </label>
                  <input
                    id="note-title"
                    className="note-title-input"
                    aria-label="Título de la nota"
                    placeholder="Nombre de la nota"
                    maxLength={150}
                    required
                    value={draft.title}
                    onChange={(e) => change('title', e.target.value)}
                  />
                  <label
                    className="note-editor-label"
                    htmlFor="note-description"
                  >
                    Contenido <span>Opcional</span>
                  </label>
                  <textarea
                    id="note-description"
                    className="note-body-input"
                    aria-label="Contenido de la nota"
                    placeholder="Escribe tu nota..."
                    value={draft.description}
                    onChange={(e) => change('description', e.target.value)}
                  />
                  <div className="note-editor-options">
                    <label>
                      Prioridad
                      <select
                        value={draft.priority}
                        onChange={(e) => change('priority', e.target.value)}
                      >
                        {Object.entries(priorityLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Fecha y hora
                      <input
                        type="datetime-local"
                        value={localDateTime(draft.noteDate)}
                        onChange={(e) =>
                          change(
                            'noteDate',
                            e.target.value
                              ? new Date(e.target.value).toISOString()
                              : ''
                          )
                        }
                      />
                    </label>
                    <label className="note-relation-field">
                      Relacionado con
                      <select
                        value={
                          draft.relationType
                            ? `${draft.relationType}:${draft.relationId}`
                            : ''
                        }
                        onChange={(e) => {
                          const [type, id] = e.target.value.split(':')
                          setDraft((current) => ({
                            ...current,
                            relationType: type || '',
                            relationId: id ? Number(id) : ''
                          }))
                        }}
                      >
                        <option value="">Sin relación</option>
                        {draft.relationType &&
                          !relations.some(
                            (r) =>
                              r.type === draft.relationType &&
                              String(r.id) === String(draft.relationId)
                          ) && (
                            <option
                              value={`${draft.relationType}:${draft.relationId}`}
                            >
                              {relationLabel(draft)}
                            </option>
                          )}
                        {Object.entries(relationLabels).map(([type, label]) => (
                          <optgroup key={type} label={label}>
                            {relations
                              .filter((r) => r.type === type)
                              .map((r) => (
                                <option
                                  key={`${r.type}:${r.id}`}
                                  value={`${r.type}:${r.id}`}
                                >
                                  {r.label}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="note-editor-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.pinned}
                        onChange={(e) => change('pinned', e.target.checked)}
                      />
                      <Icon>push_pin</Icon>Fijada
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.status === 'completada'}
                        onChange={(e) =>
                          change(
                            'status',
                            e.target.checked ? 'completada' : 'pendiente'
                          )
                        }
                      />
                      <Icon>check_circle</Icon>Completada
                    </label>
                  </div>
                </fieldset>
                <footer className="note-editor-footer">
                  <div className="note-editor-footer-meta">
                    <span>
                      {draft.updatedAt
                        ? `Editada el ${dateLabel(draft.updatedAt)}`
                        : 'Nueva nota'}
                      {dirty ? ' · Sin guardar' : ''}
                    </span>
                    {draft.id && (
                      <button
                        type="button"
                        className="notes-tool note-delete"
                        title="Eliminar nota"
                        aria-label="Eliminar nota"
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'delete' })}
                      >
                        <Icon>delete</Icon>
                      </button>
                    )}
                  </div>
                  <div className="note-editor-footer-actions">
                    <button
                      type="button"
                      className="note-cancel"
                      disabled={busy}
                      onClick={closeEditor}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="note-save" disabled={busy}>
                      {busy ? (
                        <span className="app-spinner" aria-hidden="true" />
                      ) : (
                        <Icon>check</Icon>
                      )}
                      {busy
                        ? 'Guardando...'
                        : draft.id
                          ? 'Guardar cambios'
                          : 'Crear nota'}
                    </button>
                  </div>
                </footer>
              </form>
            )}
          </div>,
          document.body
        )}
    </section>
  )
}
