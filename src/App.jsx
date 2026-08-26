import { useEffect, useMemo, useState } from 'react'
import logo from '../logo.png'
import { getCurrentSession, signIn, signOut, subscribeToAuthChanges } from './services/authService'
import {
  addDebtPayment as addDebtPaymentService,
  createCashMovement as createCashMovementService,
  createDebtSale,
  createLog,
  createProduct as createProductService,
  createSale,
  deleteProduct as deleteProductService,
  getAppState,
  reverseTransaction as reverseTransactionService,
  updateProduct as updateProductService,
} from './services'

const productTypes = ['Sativa', 'Indica', 'Hybrida']

const initialProducts = []

/* -- Helpers ----------------------------------------------- */
function profitPct(purchase, sale) {
  if (!purchase || !sale) return 0
  return Math.round(((sale - purchase) / purchase) * 100)
}

function stockLevel(stock) {
  if (stock <= 0) return 'out'
  if (stock <= 5) return 'low'
  if (stock <= 15) return 'mid'
  return 'ok'
}

function money(value) {
  return `RD$${Number(value || 0).toFixed(2)}`
}

function productTitle(product) {
  if (!product) return ''
  return `${product.name} (${product.type || 'Hybrida'})`
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function productMatches(product, query) {
  const needle = normalizeText(query)
  if (!needle) return true
  return normalizeText([
    product.name,
    product.type,
    product.size,
    product.purchasePrice,
    product.salePrice,
    product.stock,
  ].join(' ')).includes(needle)
}

function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIndex = (safePage - 1) * pageSize

  return {
    page: safePage,
    totalPages,
    items: items.slice(startIndex, startIndex + pageSize),
    start: items.length === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, items.length),
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}



/* ── ConfirmDialog — Componente único de confirmación ──── */
function ConfirmDialog({
  open,
  icon = 'warning',
  iconBg = '#fff1f2',
  iconColor = 'var(--danger)',
  title,
  body,
  children,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  confirmClass = 'danger-btn',
  onCancel,
  onConfirm,
  isLoading = false,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !isLoading) onCancel?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, isLoading, onCancel])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={() => !isLoading && onCancel?.()}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon-wrap" style={{ background: iconBg }}>
          <span className="material-symbols-outlined modal-icon" style={{ color: iconColor }}>
            {icon}
          </span>
        </div>
        {title && <h3>{title}</h3>}
        {body && <p>{body}</p>}
        {children}
        <div className="confirm-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── EmptyState — Estado vacío consistente ──────────────── */
function EmptyState({ icon = 'inbox', title, subtitle }) {
  return (
    <div className="empty-state-enhanced">
      <div className="empty-state-icon">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      {title && <p className="empty-state-title">{title}</p>}
      {subtitle && <p className="empty-state-subtitle">{subtitle}</p>}
    </div>
  )
}

/* ── StatusBadge ─────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    pending: { icon: 'schedule', label: 'Pendiente', cls: 'status-pending' },
    partial: { icon: 'incomplete_circle', label: 'Parcial', cls: 'status-partial' },
    paid: { icon: 'check_circle', label: 'Pagada', cls: 'status-paid' },
  }
  const info = map[status] || map.pending
  return (
    <span className={`status-badge ${info.cls}`}>
      <span className="material-symbols-outlined">{info.icon}</span>
      {info.label}
    </span>
  )
}

/* ── ProductImageModal — Galería de imagen de producto ───── */
function ProductImageModal({ src, name, onClose }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div className="img-modal-overlay" onClick={onClose}>
      <button className="img-modal-close" type="button" onClick={onClose} aria-label="Cerrar imagen">
        <span className="material-symbols-outlined">close</span>
      </button>
      <div className="img-modal-content" onClick={(e) => e.stopPropagation()}>
        <img className="img-modal-img" src={src} alt={name} />
        {name && <p className="img-modal-name">{name}</p>}
      </div>
    </div>
  )
}

/* ── CostVisibilityToggle ────────────────────────────────── */
function CostVisibilityToggle({ showCosts, onChange }) {
  return (
    <div className="cost-toggle-bar">
      <button
        type="button"
        className={`cost-toggle-btn ${!showCosts ? 'costs-hidden' : ''}`}
        onClick={() => onChange(!showCosts)}
        title={showCosts ? 'Ocultar precio de compra' : 'Mostrar precio de compra'}
      >
        <span className="material-symbols-outlined">
          {showCosts ? 'visibility' : 'visibility_off'}
        </span>
        {showCosts ? 'Ocultar costos' : 'Mostrar costos'}
      </button>
    </div>
  )
}

/* ── CustomerPicker — Selector de clientes para FIAR ─────── */
function CustomerPicker({ open, customers, selectedName, onSelect, onClose }) {
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (!open) { setSearch(''); setShowNewForm(false); setNewName('') }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const filtered = customers.filter((c) =>
    normalizeText(c.name).includes(normalizeText(search))
  )

  const handleNewCustomer = (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    onSelect(name)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="customer-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="customer-picker-header">
          <div className="customer-picker-title">
            <span className="material-symbols-outlined">person_search</span>
            <span>Seleccionar cliente</span>
          </div>
          <button className="customer-picker-close" type="button" onClick={onClose} aria-label="Cerrar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="customer-picker-search">
          <label className="smart-search">
            <span className="material-symbols-outlined">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              type="search"
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}>
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </label>
        </div>

        <div className="customer-picker-list">
          {filtered.length === 0 && search && (
            <div className="customer-picker-empty">
              <span className="material-symbols-outlined">search_off</span>
              No encontramos clientes con ese nombre.
            </div>
          )}
          {filtered.length === 0 && !search && customers.length === 0 && (
            <div className="customer-picker-empty">
              <span className="material-symbols-outlined">group</span>
              Todavía no hay clientes registrados.
            </div>
          )}
          {filtered.map((customer) => {
            const isSelected = selectedName === customer.name
            const hasPending = customer.totalPending > 0
            return (
              <button
                key={customer.name}
                type="button"
                className={`customer-picker-item ${isSelected ? 'selected' : ''}`}
                onClick={() => { onSelect(customer.name); onClose() }}
              >
                <div className="customer-picker-avatar">
                  <span className="material-symbols-outlined">
                    {hasPending ? 'person_alert' : 'verified_user'}
                  </span>
                </div>
                <div className="customer-picker-info">
                  <span className="customer-picker-name">{customer.name}</span>
                  <span className="customer-picker-meta">
                    {customer.debts.length} cuenta{customer.debts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {hasPending ? (
                  <span className="customer-picker-debt">
                    Debe {money(customer.totalPending)}
                  </span>
                ) : (
                  <span className="customer-picker-debt paid">Al día</span>
                )}
                {isSelected && (
                  <span className="customer-picker-check">
                    <span className="material-symbols-outlined">check</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {showNewForm ? (
          <form className="customer-picker-new-form" onSubmit={handleNewCustomer}>
            <label htmlFor="new-customer-name">Nombre del nuevo cliente</label>
            <div className="input-with-icon">
              <span className="material-symbols-outlined">person_add</span>
              <input
                id="new-customer-name"
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Danielito"
                autoFocus
                required
              />
            </div>
            <div className="confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setShowNewForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="primary-btn">
                <span className="material-symbols-outlined">check</span>
                Usar este nombre
              </button>
            </div>
          </form>
        ) : (
          <div className="customer-picker-footer">
            <button
              type="button"
              className="customer-picker-new"
              onClick={() => setShowNewForm(true)}
            >
              <span className="material-symbols-outlined">add_circle</span>
              + Nuevo cliente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── PaymentModal — Registrar abono a una cuenta ─────────── */
function PaymentModal({ open, debt, onClose, onSubmit, isSaving }) {
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) { setAmount(''); setPaymentMethod('cash'); setNote('') }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !isSaving) onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, isSaving, onClose])

  if (!open || !debt) return null

  const remaining = Number(debt.remainingAmount || 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(debt, { amount, paymentMethod, note })
  }

  return (
    <div className="modal-backdrop" onClick={() => !isSaving && onClose()}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <div className="payment-modal-title">
            <span className="payment-modal-account">
              Cuenta #{String(debt.id).slice(-5)}
            </span>
            <span className="payment-modal-customer">{debt.customerName}</span>
          </div>
          <button
            type="button"
            className="payment-modal-close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="payment-modal-balance">
          <span className="payment-modal-balance-label">Saldo pendiente</span>
          <span className="payment-modal-balance-amount">{money(remaining)}</span>
        </div>

        <form className="payment-modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-group-label">Monto a abonar</label>
            <div className="input-with-icon">
              <span className="material-symbols-outlined">payments</span>
              <input
                className="form-input"
                type="number"
                min="0.01"
                max={remaining}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Máx ${money(remaining)}`}
                disabled={isSaving}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-group-label">Método de pago</label>
            <div className="input-with-icon">
              <span className="material-symbols-outlined">account_balance_wallet</span>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={isSaving}
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-group-label">Nota (opcional)</label>
            <div className="input-with-icon">
              <span className="material-symbols-outlined">edit_note</span>
              <input
                className="form-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Pago parcial"
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="payment-modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="primary-btn" disabled={isSaving}>
              <span className="material-symbols-outlined">
                {isSaving ? 'hourglass_empty' : 'add_card'}
              </span>
              {isSaving ? 'Registrando...' : 'Registrar abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LoginScreen({ form, setForm, onLogin, isSubmitting }) {
  return (
    <div className="plain-auth-screen">
      <main className="plain-auth-card">
        <h1 className="plain-auth-title">Iniciar Sesión</h1>

        <form className="plain-auth-form" onSubmit={onLogin}>
          <label className="plain-auth-field">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Correo"
              autoComplete="email"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="plain-auth-field">
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Contraseña"
              autoComplete="current-password"
              disabled={isSubmitting}
              required
            />
          </label>

          <button className="plain-auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

      </main>
    </div>
  )
}

function ToastHost({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast-${toast.type}`}
          type="button"
          onClick={() => onDismiss(toast.id)}
        >
          <span className="material-symbols-outlined toast-icon">
            {toast.type === 'error' ? 'cancel' : 'check_circle'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </button>
      ))}
    </div>
  )
}

function GramFilter({ value, options, onChange, fullWidth = false }) {
  const [open, setOpen] = useState(false)

  const chooseOption = (option) => {
    onChange(option)
    setOpen(false)
  }

  return (
    <div
      className={`gram-filter ${fullWidth ? 'gram-filter-full' : ''} ${open ? 'open' : ''}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        className="gram-filter-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filtro actual: ${value}`}
      >
        <span className="material-symbols-outlined">filter_list</span>
        <strong>{value}</strong>
        <span className="material-symbols-outlined gram-filter-caret">expand_more</span>
      </button>

      {open && (
        <div className="gram-filter-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option}
              className={`gram-filter-option ${value === option ? 'active' : ''}`}
              type="button"
              onClick={() => chooseOption(option)}
              role="option"
              aria-selected={value === option}
            >
              {value === option && <span className="material-symbols-outlined">check</span>}
              <span>{option}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SmartSearch({
  value,
  onChange,
  placeholder,
  count,
  children,
}) {
  return (
    <div className="smart-filter-panel">
      <label className="smart-search">
        <span className="material-symbols-outlined">search</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="search"
          aria-label={placeholder}
        />
        {value && (
          <button type="button" onClick={() => onChange('')} aria-label="Limpiar búsqueda">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </label>
      <div className="smart-filter-actions">
        {children}
        <span className="filter-count-badge">{count}</span>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, start, end, total, onPageChange }) {
  if (total <= 0 || totalPages <= 1) return null

  return (
    <div className="pager">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina anterior"
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>
      <div className="pager-meta">
        <strong>{page} / {totalPages}</strong>
        <span>{start}-{end} de {total}</span>
      </div>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Pagina siguiente"
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>
    </div>
  )
}

function CashModule({ transactions, summary, movementForm, setMovementForm, addCashMovement, onRevertTransaction, isSaving }) {
  const [cashSearch, setCashSearch] = useState('')
  const [cashPage, setCashPage] = useState(1)
  const [revertTarget, setRevertTarget] = useState(null)
  const [isReverting, setIsReverting] = useState(false)

  const getEntryLabel = (entry) =>
    entry.type === 'sale'
      ? 'Venta'
      : entry.type === 'debt_sale'
        ? 'Venta fiada'
        : entry.type === 'debt_payment'
          ? 'Abono deuda'
          : entry.type === 'income'
            ? 'Ingreso'
            : 'Egreso'

  const recentTransactions = useMemo(() => {
    const query = normalizeText(cashSearch)
    return [...transactions]
      .filter((entry) => {
        if (!query) return true
        const itemsText = entry.items?.map((item) => `${item.quantity} ${productTitle(item)}`).join(' ') || ''
        return normalizeText([
          getEntryLabel(entry),
          entry.note,
          entry.amount,
          entry.paymentMethod,
          new Date(entry.date).toLocaleString(),
          itemsText,
        ].join(' ')).includes(query)
      })
      .sort((a, b) => b.id - a.id)
  }, [transactions, cashSearch])
  const cashPagination = paginate(recentTransactions, cashPage, 6)

  useEffect(() => {
    setCashPage(1)
  }, [cashSearch, transactions.length])

  const closeRevertModal = () => {
    if (!isReverting) setRevertTarget(null)
  }

  const confirmRevert = async () => {
    if (!revertTarget || !onRevertTransaction) return
    setIsReverting(true)
    const reverted = await onRevertTransaction(revertTarget)
    setIsReverting(false)
    if (reverted) setRevertTarget(null)
  }

  return (
    <div className="cash-shell">
      <div className="cash-hero">
        <span className="cash-label">Total en caja</span>
        <strong>{money(summary.registeredBalance)}</strong>
      </div>

      <div className="cash-grid cash-grid-simple">
        <div className="cash-stat">
          <span>Ventas generales</span>
          <strong>{money(summary.salesTotal)}</strong>
        </div>
      </div>

      <form className="cash-move-card" onSubmit={addCashMovement}>
        <div className="section-head">
          <div className="section-title-row">
            <span className="material-symbols-outlined">payments</span>
            <span className="section-title">Movimiento</span>
          </div>
        </div>

        <div className="cash-segment">
          <button
            type="button"
            className={`cash-segment-btn income ${movementForm.type === 'income' ? 'active' : ''}`}
            onClick={() => setMovementForm({ ...movementForm, type: 'income' })}
          >
            <span className="material-symbols-outlined">add_circle</span>
            Ingreso
          </button>
          <button
            type="button"
            className={`cash-segment-btn expense ${movementForm.type === 'expense' ? 'active' : ''}`}
            onClick={() => setMovementForm({ ...movementForm, type: 'expense' })}
          >
            <span className="material-symbols-outlined">remove_circle</span>
            Egreso
          </button>
        </div>

        <label className="form-group">
          <span>Monto</span>
          <div className="input-with-icon">
            <span className="material-symbols-outlined">attach_money</span>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="0.01"
              value={movementForm.amount}
              onChange={(e) => setMovementForm({ ...movementForm, amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        </label>

        <label className="form-group">
          <span>Comentario</span>
          <div className="input-with-icon">
            <span className="material-symbols-outlined">edit_note</span>
            <input
              className="form-input"
              value={movementForm.note}
              onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })}
              placeholder="Ej. Retiro pa' compra"
            />
          </div>
        </label>

        <button className="primary-btn full-width" type="submit" disabled={isSaving}>
          <span className="material-symbols-outlined">
            {movementForm.type === 'income' ? 'add_card' : 'payments'}
          </span>
          {isSaving ? 'Guardando...' : movementForm.type === 'income' ? 'Registrar ingreso' : 'Registrar egreso'}
        </button>
      </form>

      <div className="cash-log-card">
        <div className="section-head">
          <div className="section-title-row">
            <span className="material-symbols-outlined">receipt_long</span>
            <span className="section-title">Historial</span>
          </div>
        </div>

        <SmartSearch
          value={cashSearch}
          onChange={setCashSearch}
          placeholder="Buscar venta, ingreso, egreso o producto"
          count={`${recentTransactions.length} movimientos`}
        />

        {recentTransactions.length === 0 ? (
          <EmptyState
            icon={transactions.length === 0 ? 'receipt_long' : 'search_off'}
            title={transactions.length === 0 ? 'Sin movimientos aún' : 'Sin resultados'}
            subtitle={transactions.length === 0 ? 'Registra tu primer movimiento o venta.' : 'Intenta con otro término de búsqueda.'}
          />
        ) : (
          <ul className="cash-log-list">
            {cashPagination.items.map((entry) => (
              <li key={entry.id} className={`cash-log-item ${entry.type}`}>
                <div>
                  <strong>{getEntryLabel(entry)}</strong>
                  <span>{new Date(entry.date).toLocaleString()}</span>
                  {entry.note && <em>{entry.note}</em>}
                  {entry.items?.length > 0 && (
                    <small>{entry.items.map((item) => `${item.quantity}x ${productTitle(item)}`).join(', ')}</small>
                  )}
                </div>
                <div className="cash-log-amount">
                  <strong>{entry.type === 'expense' ? '-' : '+'}{money(entry.amount)}</strong>
                  <button type="button" className="revert-log-btn" onClick={() => setRevertTarget(entry)}>
                    <span className="material-symbols-outlined">undo</span>
                    Revertir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={cashPagination.page}
          totalPages={cashPagination.totalPages}
          start={cashPagination.start}
          end={cashPagination.end}
          total={recentTransactions.length}
          onPageChange={setCashPage}
        />
      </div>

      <ConfirmDialog
        open={!!revertTarget}
        icon="undo"
        iconBg="#ecfdf3"
        iconColor="var(--success)"
        title="Revertir movimiento"
        onCancel={closeRevertModal}
        onConfirm={confirmRevert}
        confirmLabel="Revertir"
        confirmClass="revert-confirm-btn"
        isLoading={isReverting}
      >
        <p>Esto deshará el movimiento y dejará caja, stock y deudas como estaban antes.</p>
        {revertTarget && (
          <div className="revert-summary">
            <span>{getEntryLabel(revertTarget)}</span>
            <strong>{money(revertTarget.amount)}</strong>
            {revertTarget.note && <small>{revertTarget.note}</small>}
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}

function EstimatesModule({ products, cashSummary }) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '')
  const [expandedEstimateIds, setExpandedEstimateIds] = useState([])
  const [estimateSearch, setEstimateSearch] = useState('')
  const [estimateGramFilter, setEstimateGramFilter] = useState('Todos')
  const [estimateTypeFilter, setEstimateTypeFilter] = useState('Todos')
  const [estimatePage, setEstimatePage] = useState(1)
  const sizeOptions = useMemo(
    () => ['Todos', ...Array.from({ length: 9 }, (_, i) => `${i + 1} g`)],
    []
  )
  const typeOptions = useMemo(() => ['Todos', ...productTypes], [])
  const rows = products
    .filter((product) => product.stock > 0)
    .map((product) => {
      const cost = product.purchasePrice * product.stock
      const revenue = product.salePrice * product.stock
      const profit = revenue - cost
      const unitProfit = product.salePrice - product.purchasePrice
      return { ...product, cost, revenue, profit, unitProfit }
    })
  const filteredRows = rows.filter((row) => {
    const gramOk = estimateGramFilter === 'Todos' || row.size === estimateGramFilter
    const typeOk = estimateTypeFilter === 'Todos' || (row.type || 'Hybrida') === estimateTypeFilter
    return gramOk && typeOk && productMatches(row, estimateSearch)
  })

  const totals = rows.reduce(
    (acc, row) => ({
      cost: acc.cost + row.cost,
      revenue: acc.revenue + row.revenue,
      profit: acc.profit + row.profit,
      units: acc.units + row.stock,
    }),
    { cost: 0, revenue: 0, profit: 0, units: 0 }
  )

  const selectedRow = filteredRows.find((row) => row.id === Number(selectedProductId)) || filteredRows[0]
  const averageUnitCost = totals.units > 0 ? totals.cost / totals.units : 0
  const profitMargin = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) : 0
  const cashTotal = cashSummary?.registeredBalance || 0
  const projectedCashAndInventory = cashTotal + totals.revenue
  const toggleEstimateRow = (id) => {
    setExpandedEstimateIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    )
  }
  const expandAllEstimates = () => setExpandedEstimateIds(filteredRows.map((row) => row.id))
  const collapseAllEstimates = () => setExpandedEstimateIds([])
  const estimatePagination = paginate(filteredRows, estimatePage, 5)

  useEffect(() => {
    setEstimatePage(1)
  }, [estimateSearch, estimateGramFilter, estimateTypeFilter, products.length])

  return (
    <div className="estimate-shell">
      <div className="estimate-hero">
        <span>Ganancia proyectada</span>
        <strong>{money(totals.profit)}</strong>
        <small>Ganancias en precio venta, sin la inversión</small>
      </div>

      <div className="estimate-main-grid">
        <div className="estimate-big-card">
          <span>Inventario disponible</span>
          <strong>{money(totals.cost)}</strong>
          <small>Inversión actual en inventario</small>
        </div>
        <div className="estimate-big-card success">
          <span>Venta total si vendo todo</span>
          <strong>{money(totals.revenue)}</strong>
          <small>Suma de inventario al precio de venta</small>
        </div>
        <div className="estimate-big-card cash-projection">
          <span>Total en caja + venta total</span>
          <strong>{money(projectedCashAndInventory)}</strong>
          <small>Caja actual {money(cashTotal)} + inventario</small>
        </div>
      </div>

      <div className="estimate-grid">
        <div className="estimate-stat">
          <span>Unidades</span>
          <strong>{totals.units}</strong>
        </div>

      </div>

      <div className="estimate-card">
        <div className="section-head">
          <div className="section-title-row">
            <span className="material-symbols-outlined">calculate</span>
            <span className="section-title">Calculo</span>
          </div>
        </div>

        <SmartSearch
          value={estimateSearch}
          onChange={setEstimateSearch}
          placeholder="Buscar producto, tipo o gramos"
          count={`${filteredRows.length} productos`}
        >
          <GramFilter value={estimateGramFilter} options={sizeOptions} onChange={setEstimateGramFilter} />
          <GramFilter value={estimateTypeFilter} options={typeOptions} onChange={setEstimateTypeFilter} />
        </SmartSearch>

        {selectedRow && (
          <>
            <label className="estimate-picker">
              <span>Producto</span>
              <select
                value={selectedRow.id}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                {filteredRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {productTitle(row)}
                  </option>
                ))}
              </select>
            </label>

            <div className="estimate-focus">
              <div className="estimate-focus-head">
                <img src={selectedRow.image} alt={selectedRow.name} loading="lazy" decoding="async" />
                <div>
                  <span>{selectedRow.size}</span>
                  <strong>{productTitle(selectedRow)}</strong>
                  <small>{selectedRow.stock} unidades disponibles</small>
                </div>
              </div>
              <div className="estimate-focus-grid">
                <div>
                  <span>Costo unidad</span>
                  <strong>{money(selectedRow.purchasePrice)}</strong>
                </div>
                <div>
                  <span>Unidades</span>
                  <strong>{selectedRow.stock}</strong>
                </div>
                <div>
                  <span>Costo total</span>
                  <strong>{money(selectedRow.cost)}</strong>
                </div>
                <div>
                  <span>Venta total</span>
                  <strong>{money(selectedRow.revenue)}</strong>
                </div>
                <div>
                  <span>Ganancia total</span>
                  <strong>{money(selectedRow.profit)}</strong>
                </div>
                <div>
                  <span>Ganancia unidad</span>
                  <strong>{money(selectedRow.unitProfit)}</strong>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="estimate-subhead">Si vendo todo por producto</div>
        <div className="estimate-list-toolbar">
          <button type="button" onClick={expandAllEstimates}>Expandir</button>
          <button type="button" onClick={collapseAllEstimates}>Contraer</button>
        </div>
        <ul className="estimate-list">
          {filteredRows.length === 0 && (
            <li className="empty-state">No hay productos con ese filtro</li>
          )}
          {estimatePagination.items.map((row) => {
            const isExpanded = expandedEstimateIds.includes(row.id)
            return (
              <li key={row.id} className={`estimate-item ${isExpanded ? 'expanded' : ''}`}>
                <button
                  className="estimate-item-toggle"
                  type="button"
                  onClick={() => toggleEstimateRow(row.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="estimate-product">
                    <img src={row.image} alt={row.name} loading="lazy" decoding="async" />
                    <div>
                      <strong>{productTitle(row)}</strong>
                      <span>{row.stock} uds · {row.size}</span>
                    </div>
                  </div>
                  <div className="estimate-item-summary">
                    <span>Ganaria</span>
                    <strong>{money(row.profit)}</strong>
                  </div>
                  <span className="material-symbols-outlined estimate-chevron">
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {isExpanded && (
                  <div className="estimate-values">
                    <span><em>Costo unidad</em><b>{money(row.purchasePrice)}</b></span>
                    <span><em>Unidades</em><b>{row.stock}</b></span>
                    <span><em>Invertido</em><b>{money(row.purchasePrice)} x {row.stock} = {money(row.cost)}</b></span>
                    <span><em>Venderia</em><b>{money(row.salePrice)} x {row.stock} = {money(row.revenue)}</b></span>
                    <strong><em>Ganaria</em><b>{money(row.profit)}</b></strong>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <Pagination
          page={estimatePagination.page}
          totalPages={estimatePagination.totalPages}
          start={estimatePagination.start}
          end={estimatePagination.end}
          total={filteredRows.length}
          onPageChange={setEstimatePage}
        />
      </div>
    </div>
  )
}

function DebtsModule({ debts, customers, addDebtPayment, paymentSavingId }) {
  const [debtSearch, setDebtSearch] = useState('')
  const [debtPage, setDebtPage] = useState(1)
  const [expandedCustomers, setExpandedCustomers] = useState([])
  const [expandedHistories, setExpandedHistories] = useState([])
  const [paymentModal, setPaymentModal] = useState({ open: false, debt: null })
  const [isSavingPayment, setIsSavingPayment] = useState(false)

  const debtTotals = debts.reduce(
    (acc, debt) => ({
      total: acc.total + Number(debt.totalAmount || 0),
      paid: acc.paid + Number(debt.paidAmount || 0),
      pending: acc.pending + Number(debt.remainingAmount || 0),
      open: acc.open + (Number(debt.remainingAmount || 0) > 0 ? 1 : 0),
    }),
    { total: 0, paid: 0, pending: 0, open: 0 }
  )

  const filteredCustomers = customers.filter((customer) => {
    const needle = normalizeText(debtSearch)
    if (!needle) return true
    const debtsText = customer.debts
      .map((debt) => `${debt.status} ${debt.totalAmount} ${debt.paidAmount} ${debt.remainingAmount} ${(debt.items || []).map(productTitle).join(' ')}`)
      .join(' ')
    return normalizeText(`${customer.name} ${customer.topProduct} ${debtsText}`).includes(needle)
  })
  const debtPagination = paginate(filteredCustomers, debtPage, 4)

  useEffect(() => {
    setDebtPage(1)
  }, [debtSearch, debts.length])

  const toggleCustomer = (customerName) => {
    setExpandedCustomers((current) =>
      current.includes(customerName)
        ? current.filter((name) => name !== customerName)
        : [...current, customerName]
    )
  }

  const toggleHistory = (debtId) => {
    setExpandedHistories((current) =>
      current.includes(debtId)
        ? current.filter((id) => id !== debtId)
        : [...current, debtId]
    )
  }

  const openPaymentModal = (debt) => {
    setPaymentModal({ open: true, debt })
  }

  const closePaymentModal = () => {
    if (!isSavingPayment) setPaymentModal({ open: false, debt: null })
  }

  const handlePaymentSubmit = async (debt, draft) => {
    setIsSavingPayment(true)
    const ok = await addDebtPayment(debt, draft)
    setIsSavingPayment(false)
    if (ok) setPaymentModal({ open: false, debt: null })
  }

  return (
    <div className="debt-shell">
      <div className="debt-hero">
        <span>Cuentas por cobrar</span>
        <strong>{money(debtTotals.pending)}</strong>
        <small>Saldo pendiente, no se suma a caja hasta que se abone</small>
      </div>

      <div className="debt-stat-grid">
        <div className="debt-stat-card">
          <div className="debt-stat-label">
            <span className="material-symbols-outlined">payments</span>
            <span>Abonado</span>
          </div>
          <strong>{money(debtTotals.paid)}</strong>
        </div>
        <div className="debt-stat-card">
          <div className="debt-stat-label">
            <span className="material-symbols-outlined">groups</span>
            <span>Clientes</span>
          </div>
          <strong>{customers.length}</strong>
        </div>
        <div className="debt-stat-card warning">
          <div className="debt-stat-label">
            <span className="material-symbols-outlined">pending_actions</span>
            <span>Deudas abiertas</span>
          </div>
          <strong>{debtTotals.open}</strong>
        </div>
      </div>

      <div className="debt-card">
        <div className="section-head">
          <div className="section-title-row">
            <span className="material-symbols-outlined">contract</span>
            <span className="section-title">Clientes con deuda</span>
          </div>
        </div>

        <SmartSearch
          value={debtSearch}
          onChange={setDebtSearch}
          placeholder="Buscar cliente, producto o monto"
          count={`${filteredCustomers.length} clientes`}
        />

        <div className="debt-client-list">
          {filteredCustomers.length === 0 && (
            <EmptyState
              icon={debts.length === 0 ? 'handshake' : 'search_off'}
              title={debts.length === 0 ? 'Sin deudas registradas' : 'Sin resultados'}
              subtitle={debts.length === 0 ? 'Usa el método "Fiar" al vender para registrar una deuda.' : 'Intenta con otro nombre o término.'}
            />
          )}
          {debtPagination.items.map((customer) => {
            const isExpanded = expandedCustomers.includes(customer.name)
            const hasPending = customer.totalPending > 0
            return (
              <article
                key={customer.name}
                className={`debt-client-card ${isExpanded ? 'expanded' : 'collapsed'} ${hasPending ? 'pending' : 'paid'}`}
              >
                <button
                  className="debt-client-toggle"
                  type="button"
                  onClick={() => toggleCustomer(customer.name)}
                  aria-expanded={isExpanded}
                >
                  <div className="debt-client-identity">
                    <span className="material-symbols-outlined debt-client-avatar">
                      {hasPending ? 'person_alert' : 'verified_user'}
                    </span>
                    <div className="debt-client-main">
                      <span className="debt-client-kicker">
                        {customer.debts.length} cuenta{customer.debts.length === 1 ? '' : 's'}
                      </span>
                      <strong className="debt-client-name">{customer.name}</strong>
                    </div>
                  </div>

                  <div className="debt-client-summary">
                    <span className={`debt-status-pill ${hasPending ? 'pending' : 'paid'}`}>
                      <span className="material-symbols-outlined">
                        {hasPending ? 'schedule' : 'check_circle'}
                      </span>
                      {hasPending ? 'Pendiente' : 'Pagado'}
                    </span>
                    <div className="debt-client-amount">
                      <small>Debe</small>
                      <strong>
                        <span className="material-symbols-outlined">account_balance_wallet</span>
                        {money(customer.totalPending)}
                      </strong>
                    </div>
                  </div>

                  <span className="material-symbols-outlined debt-expand-icon">
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="debt-client-details">
                    {/* Resumen de cliente */}
                    <div className="debt-client-summary-stats">
                      <div className="debt-client-summary-stat">
                        <span className="debt-client-summary-stat-label">Total</span>
                        <span className="debt-client-summary-stat-value">{money(customer.totalSpent)}</span>
                      </div>
                      <div className="debt-client-summary-stat">
                        <span className="debt-client-summary-stat-label">Abonado</span>
                        <span className="debt-client-summary-stat-value">{money(customer.totalPaid)}</span>
                      </div>
                      <div className={`debt-client-summary-stat ${hasPending ? 'stat-pending' : ''}`}>
                        <span className="debt-client-summary-stat-label">Pendiente</span>
                        <span className="debt-client-summary-stat-value">{money(customer.totalPending)}</span>
                      </div>
                    </div>

                    {/* Cuentas independientes */}
                    <div className="debt-accounts-list">
                      {customer.debts.map((debt) => {
                        const remaining = Number(debt.remainingAmount || 0)
                        const isPaid = remaining <= 0
                        const historyOpen = expandedHistories.includes(debt.id)
                        const productsSummary = (debt.items || [])
                          .map((item) => `${item.quantity}x ${productTitle(item)}`)
                          .join(', ')

                        let accountStatus = 'pending'
                        if (isPaid) accountStatus = 'paid'
                        else if (Number(debt.paidAmount || 0) > 0) accountStatus = 'partial'

                        return (
                          <div key={debt.id} className={`debt-account-card ${isPaid ? 'account-paid' : ''}`}>
                            <div className="debt-account-header">
                              <div className="debt-account-id">
                                <span className="debt-account-number">Cuenta #{String(debt.id).slice(-5)}</span>
                                <span className="debt-account-date">{formatDate(debt.date)}</span>
                              </div>
                              <div className="debt-account-status">
                                <StatusBadge status={accountStatus} />
                              </div>
                            </div>

                            <div className="debt-account-stats">
                              <div className="debt-account-stat">
                                <span className="debt-account-stat-label">Total</span>
                                <span className="debt-account-stat-value">{money(debt.totalAmount)}</span>
                              </div>
                              <div className="debt-account-stat">
                                <span className="debt-account-stat-label">Abonado</span>
                                <span className="debt-account-stat-value">{money(debt.paidAmount)}</span>
                              </div>
                              <div className={`debt-account-stat ${!isPaid ? 'pending' : ''}`}>
                                <span className="debt-account-stat-label">Pendiente</span>
                                <span className="debt-account-stat-value">{money(remaining)}</span>
                              </div>
                            </div>

                            {productsSummary && (
                              <div className="debt-account-products">
                                {productsSummary}
                              </div>
                            )}

                            {/* Historial de pagos expandible */}
                            {historyOpen && debt.payments?.length > 0 && (
                              <div className="debt-account-history-panel">
                                <div className="debt-account-history-title">Historial de abonos</div>
                                <div className="debt-account-history-list">
                                  {debt.payments.map((payment) => (
                                    <div key={payment.id} className="debt-account-history-item">
                                      <span className="debt-account-history-date">
                                        {formatDate(payment.date)}
                                      </span>
                                      <span className="debt-account-history-amount">
                                        +{money(payment.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="debt-account-actions">
                              {debt.payments?.length > 0 && (
                                <button
                                  type="button"
                                  className="debt-account-history-btn"
                                  onClick={() => toggleHistory(debt.id)}
                                >
                                  <span className="material-symbols-outlined">history</span>
                                  {historyOpen ? 'Ocultar' : `Ver ${debt.payments.length} abono${debt.payments.length !== 1 ? 's' : ''}`}
                                </button>
                              )}
                              {!isPaid && (
                                <button
                                  type="button"
                                  className="debt-account-pay-btn"
                                  onClick={() => openPaymentModal(debt)}
                                >
                                  <span className="material-symbols-outlined">add_card</span>
                                  Abonar
                                </button>
                              )}
                              {isPaid && (
                                <div style={{ flex: 1, textAlign: 'center', fontSize: '0.78rem', color: '#047857', fontWeight: 800 }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', verticalAlign: 'middle' }}>check_circle</span>
                                  {' '}Pagada completamente
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>

        <Pagination
          page={debtPagination.page}
          totalPages={debtPagination.totalPages}
          start={debtPagination.start}
          end={debtPagination.end}
          total={filteredCustomers.length}
          onPageChange={setDebtPage}
        />
      </div>

      {/* PaymentModal */}
      <PaymentModal
        open={paymentModal.open}
        debt={paymentModal.debt}
        onClose={closePaymentModal}
        onSubmit={handlePaymentSubmit}
        isSaving={isSavingPayment}
      />
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ email: '', password: '' })
  const [authLoading, setAuthLoading] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [products, setProducts] = useState(initialProducts)
  const [cart, setCart] = useState([])
  const [activeTab, setActiveTab] = useState('ventas')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [transactions, setTransactions] = useState([])
  const [debts, setDebts] = useState([])
  const [logs, setLogs] = useState([])
  const [toasts, setToasts] = useState([])
  const [debtSaleForm, setDebtSaleForm] = useState({ customerName: '', paidAmount: '' })
  const [movementForm, setMovementForm] = useState({
    type: 'expense',
    amount: '',
    note: '',
    paymentMethod: 'cash',
  })
  const [inventoryPage, setInventoryPage] = useState('list')
  const [editingProductId, setEditingProductId] = useState(null)
  const [salesSearch, setSalesSearch] = useState('')
  const [salesGramFilter, setSalesGramFilter] = useState('Todos')
  const [salesTypeFilter, setSalesTypeFilter] = useState('Todos')
  const [salesPage, setSalesPage] = useState(1)
  const [inventorySearch, setInventorySearch] = useState('')
  const [inventoryGramFilter, setInventoryGramFilter] = useState('Todos')
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState('Todos')
  const [inventoryListPage, setInventoryListPage] = useState(1)
  const [confirmRemove, setConfirmRemove] = useState({ open: false, productId: null })
  const [priceEdit, setPriceEdit] = useState({ open: false, itemId: null, value: '' })
  const [savingAction, setSavingAction] = useState(null)

  // New States for phase 2 and 4
  const [viewImage, setViewImage] = useState(null) // { src: string, name: string }
  const [showCosts, setShowCosts] = useState(() => {
    return localStorage.getItem('zapos_show_costs') !== 'false'
  })
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)

  // Effect to persist showCosts
  useEffect(() => {
    localStorage.setItem('zapos_show_costs', showCosts)
  }, [showCosts])

  const [stockForm, setStockForm] = useState({
    name: '',
    type: 'Hybrida',
    size: '1 g',
    purchasePrice: '',
    salePrice: '',
    stock: '',
    image: '',
    imageName: '',
  })

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0),
    [cart]
  )

  const sizeOptions = useMemo(
    () => ['Todos', ...Array.from({ length: 9 }, (_, i) => `${i + 1} g`)],
    []
  )
  const typeOptions = useMemo(() => ['Todos', ...productTypes], [])

  const filteredSalesProducts = useMemo(
    () =>
      products.filter((product) => {
        if (product.stock <= 0) return false
        const gramOk = salesGramFilter === 'Todos' || product.size === salesGramFilter
        const typeOk = salesTypeFilter === 'Todos' || (product.type || 'Hybrida') === salesTypeFilter
        return gramOk && typeOk && productMatches(product, salesSearch)
      }),
    [products, salesGramFilter, salesTypeFilter, salesSearch]
  )

  const filteredInventoryProducts = useMemo(
    () =>
      products.filter((product) => {
        const gramOk = inventoryGramFilter === 'Todos' || product.size === inventoryGramFilter
        const typeOk = inventoryTypeFilter === 'Todos' || (product.type || 'Hybrida') === inventoryTypeFilter
        return gramOk && typeOk && productMatches(product, inventorySearch)
      }),
    [products, inventoryGramFilter, inventoryTypeFilter, inventorySearch]
  )
  const salesPagination = useMemo(
    () => paginate(filteredSalesProducts, salesPage, 6),
    [filteredSalesProducts, salesPage]
  )
  const inventoryPagination = useMemo(
    () => paginate(filteredInventoryProducts, inventoryListPage, 6),
    [filteredInventoryProducts, inventoryListPage]
  )

  const totalInventoryValue = useMemo(
    () => products.reduce((s, p) => s + p.salePrice * p.stock, 0),
    [products]
  )

  const cashSummary = useMemo(() => {
    return transactions.reduce(
      (acc, entry) => {
        if (entry.type === 'sale' || entry.type === 'debt_sale' || entry.type === 'debt_payment') {
          acc.salesTotal += entry.amount
          acc.registeredBalance += entry.amount
          if (entry.paymentMethod === 'transfer') acc.transferTotal += entry.amount
          else {
            acc.cashTotal += entry.amount
            acc.cashAvailable += entry.amount
          }
        }
        if (entry.type === 'income') {
          acc.incomeTotal += entry.amount
          acc.registeredBalance += entry.amount
          if (entry.paymentMethod === 'transfer') acc.transferTotal += entry.amount
          else {
            acc.cashTotal += entry.amount
            acc.cashAvailable += entry.amount
          }
        }
        if (entry.type === 'expense') {
          acc.expenseTotal += entry.amount
          acc.registeredBalance -= entry.amount
          acc.cashAvailable -= entry.amount
        }
        return acc
      },
      { salesTotal: 0, cashTotal: 0, transferTotal: 0, cashAvailable: 0, incomeTotal: 0, expenseTotal: 0, registeredBalance: 0 }
    )
  }, [transactions])

  const globalCustomers = useMemo(() => {
    const map = new Map()
    debts.forEach((debt) => {
      const name = debt.customerName || 'Cliente sin nombre'
      if (!map.has(name)) {
        map.set(name, {
          name,
          debts: [],
          totalSpent: 0,
          totalPaid: 0,
          totalPending: 0,
          productCounts: new Map(),
        })
      }
      const customer = map.get(name)
      customer.debts.push(debt)
      customer.totalSpent += Number(debt.totalAmount || 0)
      customer.totalPaid += Number(debt.paidAmount || 0)
      customer.totalPending += Number(debt.remainingAmount || 0)
        ; (debt.items || []).forEach((item) => {
          const key = productTitle(item)
          customer.productCounts.set(key, (customer.productCounts.get(key) || 0) + Number(item.quantity || 0))
        })
    })

    return Array.from(map.values())
      .map((customer) => {
        const topProduct = Array.from(customer.productCounts.entries()).sort((a, b) => b[1] - a[1])[0]
        return {
          ...customer,
          topProduct: topProduct ? `${topProduct[0]} (${topProduct[1]} uds)` : 'Sin productos',
          debts: [...customer.debts].sort((a, b) => b.id - a.id),
        }
      })
      .sort((a, b) => b.totalPending - a.totalPending)
  }, [debts])


  const resetStockForm = () =>
    setStockForm({ name: '', type: 'Hybrida', size: '1 g', purchasePrice: '', salePrice: '', stock: '', image: '', imageName: '' })

  const showToast = (message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current.slice(-2), { id, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4000)
  }

  const dismissToast = (id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const openInventoryList = () => {
    setInventoryPage('list')
    setEditingProductId(null)
    resetStockForm()
  }

  const openInventoryForm = (product = null) => {
    if (product) {
      setEditingProductId(product.id)
      setStockForm({
        name: product.name,
        type: product.type || 'Hybrida',
        size: product.size,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        stock: product.stock,
        image: product.image,
        imageName: '',
      })
    } else {
      setEditingProductId(null)
      resetStockForm()
    }
    setInventoryPage('form')
  }

  const refreshAppState = async () => {
    const data = await getAppState()
    setProducts(data.products || [])
    setTransactions(data.transactions || [])
    setDebts(data.debts || [])
    setLogs(data.logs || [])
    return data
  }

  useEffect(() => {
    let mounted = true

    getCurrentSession()
      .then((session) => {
        if (!mounted) return
        setUser(session?.user || null)
      })
      .catch((error) => {
        console.warn(error)
        showToast('No se pudo validar la sesión', 'error')
      })
      .finally(() => {
        if (mounted) setAuthLoading(false)
      })

    const unsubscribe = subscribeToAuthChanges((session) => {
      setUser(session?.user || null)
      if (!session) {
        setProducts([])
        setTransactions([])
        setDebts([])
        setLogs([])
        setCart([])
        setActiveTab('ventas')
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return undefined
    let mounted = true
    getAppState()
      .then((data) => {
        if (!mounted) return
        setProducts(data.products || [])
        setTransactions(data.transactions || [])
        setDebts(data.debts || [])
        setLogs(data.logs || [])
      })
      .catch((error) => {
        console.warn(error)
        showToast('No se pudo cargar Supabase', 'error')
      })
    return () => {
      mounted = false
    }
  }, [user])

  useEffect(() => {
    setSalesPage(1)
  }, [salesSearch, salesGramFilter, salesTypeFilter, products.length])

  useEffect(() => {
    setInventoryListPage(1)
  }, [inventorySearch, inventoryGramFilter, inventoryTypeFilter, products.length])

  const handleLogin = async (e) => {
    e.preventDefault()
    const email = form.email.trim()
    if (!email || !form.password) {
      showToast('Escribe correo y clave', 'error')
      return
    }

    setAuthSubmitting(true)
    try {
      const session = await signIn(email, form.password)
      setUser(session?.user || null)
      setForm({ email: '', password: '' })
      showToast('Sesión iniciada')
    } catch (error) {
      showToast(error.message || 'No se pudo iniciar sesión', 'error')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const addToCart = async (product) => {
    if (product.stock <= 0) {
      showToast('No hay disponible', 'error')
      return
    }
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 0
    if (currentQuantity >= product.stock) {
      showToast('No hay más stock disponible', 'error')
      return
    }
    setCart((c) => {
      const existing = c.find((i) => i.id === product.id)
      return existing
        ? c.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...c, { ...product, quantity: 1 }]
    })
    showToast(`${productTitle(product)} agregado al carrito`)
  }

  const removeFromCart = async (item) => {
    setCart((c) => c.filter((p) => p.id !== item.id))
    showToast(`${productTitle(item)} eliminado del carrito`)
  }

  const openPriceEdit = (item) => {
    setPriceEdit({ open: true, itemId: item.id, value: String(item.salePrice) })
  }

  const closePriceEdit = () => {
    setPriceEdit({ open: false, itemId: null, value: '' })
  }

  const saveCartPrice = (e) => {
    e.preventDefault()
    const price = Number(priceEdit.value)
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Escribe un precio válido', 'error')
      return
    }
    const item = cart.find((cartItem) => cartItem.id === priceEdit.itemId)
    setCart((current) =>
      current.map((cartItem) =>
        cartItem.id === priceEdit.itemId ? { ...cartItem, salePrice: price } : cartItem
      )
    )
    closePriceEdit()
    showToast(item ? `Precio de ${productTitle(item)} ajustado` : 'Precio ajustado')
  }

  const checkout = async () => {
    if (savingAction) return
    if (cart.length === 0) {
      showToast('Agrega productos antes de paga', 'error')
      return
    }
    const paidAmount = Number(debtSaleForm.paidAmount || 0)
    const customerName = debtSaleForm.customerName.trim()
    if (paymentMethod === 'debt') {
      if (!customerName) {
        showToast('Escribe el nombre del cliente', 'error')
        return
      }
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        showToast('El abono inicial no es válido', 'error')
        return
      }
      if (paidAmount >= cartTotal) {
        showToast('Para fiar, el abono debe ser menor que el total', 'error')
        return
      }
    }
    setSavingAction('checkout')
    try {
      const saleItems = cart.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type || 'Hybrida',
        size: item.size,
        quantity: item.quantity,
        salePrice: item.salePrice,
      }))

      if (paymentMethod === 'debt') {
        await createDebtSale({
          customerName,
          totalAmount: cartTotal,
          paidAmount,
          items: saleItems,
        })
      } else {
        await createSale({
          type: 'sale',
          amount: cartTotal,
          paymentMethod,
          note: `Venta ${paymentMethod === 'cash' ? 'en efectivo' : 'por transferencia'}`,
          items: saleItems,
        })
      }

      await refreshAppState()
      setCart([])
      setPaymentMethod('cash')
      setDebtSaleForm({ customerName: '', paidAmount: '' })
      showToast(paymentMethod === 'debt' ? `Deuda registrada para ${customerName}` : `Venta registrada por ${money(cartTotal)}`)
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSavingAction(null)
    }
  }

  const addDebtPayment = async (debt, draft) => {
    if (savingAction) return false
    const amount = Number(draft.amount)
    const remaining = Number(debt.remainingAmount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Escribe un abono válido', 'error')
      return false
    }
    if (amount > remaining) {
      showToast(`No puede pasar de ${money(remaining)}`, 'error')
      return false
    }
    setSavingAction(`debt-payment-${debt.id}`)
    try {
      await addDebtPaymentService(debt.id, {
        amount,
        note: draft.note,
        paymentMethod: draft.paymentMethod || 'cash',
      })
      await refreshAppState()
      showToast(`Abono registrado: ${money(amount)}`)
      return true
    } catch (error) {
      showToast(error.message, 'error')
      return false
    } finally {
      setSavingAction(null)
    }
  }

  const addCashMovement = async (e) => {
    e.preventDefault()
    if (savingAction) return
    const amount = Number(movementForm.amount)
    if (amount <= 0) {
      showToast('Ingresa un monto válido', 'error')
      return
    }
    setSavingAction('cash')
    try {
      await createCashMovementService({
        type: movementForm.type,
        amount,
        note: movementForm.note,
      })
      await refreshAppState()
      setMovementForm({ type: 'expense', amount: '', note: '', paymentMethod: 'cash' })
      showToast(movementForm.type === 'income' ? 'Ingreso registrado en caja' : 'Egreso registrado en caja')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSavingAction(null)
    }
  }

  const revertTransaction = async (transaction) => {
    try {
      await reverseTransactionService(transaction.id)
      await refreshAppState()
      showToast('Movimiento revertido correctamente')
      return true
    } catch (error) {
      showToast(error.message, 'error')
      return false
    }
  }

  const openRemoveModal = (id) => setConfirmRemove({ open: true, productId: id })
  const closeRemoveModal = () => setConfirmRemove({ open: false, productId: null })

  const removeProduct = async () => {
    if (savingAction) return
    const product = products.find((p) => p.id === confirmRemove.productId)
    setSavingAction('delete-product')
    try {
      await deleteProductService(confirmRemove.productId)
      await createLog('success', 'product', `Producto eliminado: ${product ? productTitle(product) : 'Producto'}`, {
        productId: confirmRemove.productId,
      })
      await refreshAppState()
      closeRemoveModal()
      showToast(product ? `${productTitle(product)} eliminado` : 'Producto eliminado')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSavingAction(null)
    }
  }

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () =>
      setStockForm((c) => ({ ...c, image: reader.result, imageName: file.name }))
    reader.readAsDataURL(file)
  }

  const handleStockSave = async (e) => {
    e.preventDefault()
    if (savingAction) return
    const name = stockForm.name.trim()
    const stock = Number(stockForm.stock)
    const purchasePrice = Number(stockForm.purchasePrice)
    const salePrice = Number(stockForm.salePrice)
    if (!name || salePrice <= 0 || purchasePrice < 0 || stock < 0) {
      showToast('Revisa nombre, precios y stock', 'error')
      return
    }

    setSavingAction('stock')
    try {
      const payload = {
        name,
        type: stockForm.type,
        size: stockForm.size,
        purchasePrice,
        salePrice,
        stock,
        image: stockForm.image,
      }
      const product = editingProductId
        ? await updateProductService(editingProductId, payload)
        : await createProductService(payload)

      await createLog(
        'success',
        'product',
        editingProductId ? `Producto actualizado: ${productTitle(product)}` : `Producto creado: ${productTitle(product)}`,
        { productId: product.id }
      )
      await refreshAppState()
      showToast(editingProductId ? `${name} (${stockForm.type}) actualizado` : `${name} (${stockForm.type}) creado`)
      openInventoryList()
    } catch (error) {
      showToast(error.message, 'error')
      return
    } finally {
      setSavingAction(null)
    }
  }

  /* -- LOGIN ----------------------------------------------- */
  const handleLogout = async () => {
    try {
      await signOut()
      showToast('Sesión cerrada. Hasta luego.')
    } catch (error) {
      showToast(error.message || 'No se pudo cerrar sesión', 'error')
    }
  }

  if (authLoading) {
    return (
      <>
        <div className="plain-auth-screen">
          <main className="plain-auth-card">
            <img className="plain-auth-logo" src={logo} alt="Z4Z4" />
            <h1 className="plain-auth-title">Z4Z4</h1>
            <p className="plain-auth-loading">Verificando sesión...</p>
          </main>
        </div>
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <LoginScreen form={form} setForm={setForm} onLogin={handleLogin} isSubmitting={authSubmitting} />
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  /* -- APP ------------------------------------------------- */
  return (
    <div className="page app-page">

      {/* -- TOPBAR ------------------------------------------- */}
      <header className="topbar">
        <div className="brand-panel">
          <div className="brand-logo-wrapper">
            <img src={logo} alt="Z4Z4" className="brand-logo" />
          </div>
          <div className="brand-text">
            <span className="brand-name">Z4Z4</span>
          </div>
        </div>

        <button
          className="pushable"
          type="button"
          onClick={handleLogout}
        >
          <span className="shadow" />
          <span className="edge" />
          <span className="front">
            <span className="material-symbols-outlined">logout</span>
            Bye
          </span>
        </button>
      </header>

      {/* -- PAGE CONTENT ------------------------------------ */}
      <div className="page-content">

        {/* -- VENTAS --------------------------------------- */}
        {activeTab === 'ventas' && (
          <>
            <div className="sales-workspace">
              <div className="stats-row">
                <div className="stat-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', padding: '5px', borderRadius: '8px', fontSize: '1.1rem' }}>shopping_bag</span>
                    <span className="stat-label" style={{ margin: 0 }}>Productos en venta</span>
                  </div>
                  <span className="stat-value">{cart.length}</span>
                </div>
                <div className="stat-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', padding: '5px', borderRadius: '8px', fontSize: '1.1rem' }}>payments</span>
                    <span className="stat-label" style={{ margin: 0 }}>Total a cobrar</span>
                  </div>
                  <span className="stat-value accent">RD${cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Product list */}
              <div className="sales-products-panel">
                <div className="section-head" style={{ marginBottom: 14 }}>
                  <div className="section-title-row">
                    <span className="material-symbols-outlined">point_of_sale</span>
                    <span className="section-title">Vender</span>
                  </div>
                  <CostVisibilityToggle showCosts={showCosts} onChange={setShowCosts} />
                </div>

                <SmartSearch
                  value={salesSearch}
                  onChange={setSalesSearch}
                  placeholder="Buscar producto, tipo o gramos"
                  count={`${filteredSalesProducts.length} productos`}
                  onReset={() => {
                    setSalesSearch('');
                    setSalesGramFilter('Todos');
                    setSalesTypeFilter('Todos');
                  }}
                  hasActiveFilters={salesSearch !== '' || salesGramFilter !== 'Todos' || salesTypeFilter !== 'Todos'}
                >
                  <GramFilter value={salesGramFilter} options={sizeOptions} onChange={setSalesGramFilter} />
                  <GramFilter value={salesTypeFilter} options={typeOptions} onChange={setSalesTypeFilter} />
                </SmartSearch>

                <ul className="product-list">
                  {filteredSalesProducts.length === 0 && (
                    <li className="empty-state">No hay productos con ese filtro</li>
                  )}
                  {salesPagination.items.map((product) => (
                    <li key={product.id} className="product-item product-unified-card">
                      <div className="inv-card-img-wrap" onClick={() => setViewImage({ src: product.image, name: productTitle(product) })}>
                        <img className="inv-card-img" src={product.image} alt={product.name} loading="lazy" decoding="async" />
                        <span className={`stock-dot stock-${stockLevel(product.stock)}`} />
                      </div>

                      <div className="inv-card-body">
                        <div className="inv-card-top">
                          <span className="inv-card-name">{productTitle(product)}</span>
                          <span className={`badge ${product.stock <= 0 ? 'danger-badge' : ''}`}>
                            {product.size}
                          </span>
                        </div>

                        <div className="inv-card-prices">
                          <span className="inv-price-sale">RD${product.salePrice.toFixed(2)}</span>
                          {showCosts && (
                            <>
                              <span className="inv-price-sep">·</span>
                              <span className="inv-price-buy">Compra RD${product.purchasePrice.toFixed(2)}</span>
                            </>
                          )}
                          {!showCosts && <span className="inv-price-buy-hidden">***</span>}
                        </div>

                        <div className="inv-card-footer">
                          <div className="inv-stock-wrap">
                            <span className={`inv-stock-badge inv-stock-${stockLevel(product.stock)}`}>
                              <span className="material-symbols-outlined" style={{ fontSize: '0.8rem' }}>inventory_2</span>
                              {product.stock} uds
                            </span>
                          </div>
                          <div className="product-actions">
                            <button
                              className="small-btn product-sale-btn"
                              onClick={() => addToCart(product)}
                              disabled={product.stock <= 0}
                              title="Agregar al carrito"
                              aria-label={`Agregar ${productTitle(product)} al carrito`}
                            >
                              <span className="material-symbols-outlined">add_shopping_cart</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={salesPagination.page}
                  totalPages={salesPagination.totalPages}
                  start={salesPagination.start}
                  end={salesPagination.end}
                  total={filteredSalesProducts.length}
                  onPageChange={setSalesPage}
                />
              </div>

              {/* Cart */}
              <div className="cart-card">
                <div className="section-head">
                  <div className="section-title-row">
                    <span className="material-symbols-outlined">shopping_bag</span>
                    <span className="section-title">Carrito</span>
                  </div>
                  {cart.length > 0 && (
                    <span className="filter-count-badge">
                      {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                    </span>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="empty-state">
                    <span className="material-symbols-outlined empty-icon">shopping_cart</span>
                    Agrega productos para empezar la venta
                  </div>
                ) : (
                  <ul className="cart-list">
                    {cart.map((item) => (
                      <li key={item.id} className="cart-item">
                        <div className="cart-preview">
                          <img className="cart-thumb cart-thumb-clickable" src={item.image} alt={item.name} loading="lazy" decoding="async" onClick={() => setViewImage({ src: item.image, name: productTitle(item) })} />
                          <div className="cart-info">
                            <span className="cart-name">{productTitle(item)}</span>
                            <span className="cart-qty-price">{item.quantity} × RD${item.salePrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="cart-actions">
                          <button className="ghost-small edit-price" onClick={() => openPriceEdit(item)} title="Editar precio" aria-label={`Editar precio de ${productTitle(item)}`}>
                            <span className="material-symbols-outlined">edit_square</span>
                          </button>
                          <button className="ghost-small danger" onClick={() => removeFromCart(item)} title="Quitar" aria-label={`Quitar ${productTitle(item)} del carrito`}>
                            <span className="material-symbols-outlined">remove_shopping_cart</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="checkout-row">
                  <span>Total</span>
                  <span className="checkout-total">RD${cartTotal.toFixed(2)}</span>
                </div>
                <div className="payment-toggle">
                  <button
                    type="button"
                    className={paymentMethod === 'cash' ? 'active' : ''}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    <span className="material-symbols-outlined">payments</span>
                    Efectivo
                  </button>
                  <button
                    type="button"
                    className={paymentMethod === 'transfer' ? 'active' : ''}
                    onClick={() => setPaymentMethod('transfer')}
                  >
                    <span className="material-symbols-outlined">sync_alt</span>
                    Transferencia
                  </button>
                  <button
                    type="button"
                    className={paymentMethod === 'debt' ? 'active debt-active' : ''}
                    onClick={() => setPaymentMethod('debt')}
                  >
                    <span className="material-symbols-outlined">contract</span>
                    Fiar
                  </button>
                </div>
                {paymentMethod === 'debt' && (
                  <div className="debt-sale-panel">
                    <label className="form-group">
                      <span>Cliente</span>
                      <button
                        type="button"
                        className="customer-picker-btn"
                        onClick={() => setCustomerPickerOpen(true)}
                      >
                        <span className="material-symbols-outlined">person</span>
                        {debtSaleForm.customerName ? (
                          <span className="customer-picker-value">{debtSaleForm.customerName}</span>
                        ) : (
                          <span className="customer-picker-placeholder">Seleccionar cliente</span>
                        )}
                        <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: '1rem', color: 'var(--text-3)' }}>chevron_right</span>
                      </button>
                    </label>
                    <label className="form-group">
                      <span>Abono inicial</span>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined">add_card</span>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          max={Math.max(0, cartTotal - 0.01)}
                          step="0.01"
                          value={debtSaleForm.paidAmount}
                          onChange={(event) => setDebtSaleForm((current) => ({ ...current, paidAmount: event.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    </label>
                    <div className="debt-sale-summary">
                      <span>Pendiente</span>
                      <strong>{money(Math.max(0, cartTotal - Number(debtSaleForm.paidAmount || 0)))}</strong>
                    </div>
                  </div>
                )}
                <button className="primary-btn full-width" onClick={checkout} disabled={cart.length === 0 || savingAction === 'checkout'}>
                  <span className="material-symbols-outlined">{paymentMethod === 'debt' ? 'contract' : 'point_of_sale'}</span>
                  {savingAction === 'checkout' ? 'Guardando...' : paymentMethod === 'debt' ? 'Registrar deuda' : 'Vender'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* -- INVENTARIO ----------------------------------- */}
        {activeTab === 'inventario' && (
          <>
            {inventoryPage === 'list' ? (
              <div className="inventory-shell">

                {/* Header banners */}
                <div className="stats-row">
                  <div className="stat-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span className="material-symbols-outlined" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', padding: '5px', borderRadius: '8px', fontSize: '1.1rem' }}>category</span>
                      <span className="stat-label" style={{ margin: 0 }}>Productos</span>
                    </div>
                    <span className="stat-value">{products.length}</span>
                  </div>
                  <div className="stat-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span className="material-symbols-outlined" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', padding: '5px', borderRadius: '8px', fontSize: '1.1rem' }}>request_quote</span>
                      <span className="stat-label" style={{ margin: 0 }}>Valor total</span>
                    </div>
                    <span className="stat-value accent">RD${totalInventoryValue.toFixed(0)}</span>
                  </div>
                </div>

                <div className="section-head" style={{ marginBottom: 14 }}>
                  <div className="section-title-row">
                    <span className="material-symbols-outlined">inventory_2</span>
                    <span className="section-title">Inventario</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button className="primary-btn" onClick={() => openInventoryForm()} style={{ padding: '8px 16px', minHeight: '36px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>add_box</span>
                      Nuevo
                    </button>
                    <CostVisibilityToggle showCosts={showCosts} onChange={setShowCosts} />
                  </div>
                </div>

                {/* Filter bar */}
                <div className="inv-filter-bar" style={{ marginBottom: 14 }}>
                  <SmartSearch
                    value={inventorySearch}
                    onChange={setInventorySearch}
                    placeholder="Buscar por nombre, tipo o gramos"
                    count={`${filteredInventoryProducts.length} productos`}
                  >
                    <GramFilter value={inventoryGramFilter} options={sizeOptions} onChange={setInventoryGramFilter} />
                    <GramFilter value={inventoryTypeFilter} options={typeOptions} onChange={setInventoryTypeFilter} />
                  </SmartSearch>
                </div>

                {/* Inventory cards */}
                <ul className="inventory-list">
                  {filteredInventoryProducts.length === 0 && (
                    <li className="empty-state">No hay productos con ese filtro</li>
                  )}
                  {inventoryPagination.items.map((product) => {
                    const pct = profitPct(product.purchasePrice, product.salePrice)
                    const level = stockLevel(product.stock)
                    return (
                      <li key={product.id} className="inv-card product-unified-card">
                        {/* Image */}
                        <div className="inv-card-img-wrap" onClick={() => setViewImage({ src: product.image, name: productTitle(product) })}>
                          <img className="inv-card-img" src={product.image} alt={product.name} loading="lazy" decoding="async" />
                          <span className={`stock-dot stock-${level}`} />
                        </div>

                        {/* Info */}
                        <div className="inv-card-body">
                          {/* Top row */}
                          <div className="inv-card-top">
                            <span className="inv-card-name">{productTitle(product)}</span>
                            <span className="badge">{product.size}</span>
                          </div>

                          {/* Price row */}
                          <div className="inv-card-prices">
                            <span className="inv-price-sale">RD${product.salePrice.toFixed(2)}</span>
                            {showCosts && (
                              <>
                                <span className="inv-price-sep">·</span>
                                <span className="inv-price-buy">Compra RD${product.purchasePrice.toFixed(2)}</span>
                              </>
                            )}
                            {!showCosts && <span className="inv-price-buy-hidden">***</span>}
                          </div>

                          {/* Bottom row */}
                          <div className="inv-card-footer">
                            <div className="inv-stock-wrap">
                              <span className={`inv-stock-badge inv-stock-${level}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '0.8rem' }}>inventory_2</span>
                                {product.stock} uds
                              </span>
                              <span className={`inv-profit-badge inv-profit-${pct >= 30 ? 'great' : pct >= 10 ? 'ok' : 'low'}`}>
                                +{pct}%
                              </span>
                            </div>
                            <div className="inv-card-actions">
                              <button
                                className="inv-action-btn edit"
                                onClick={() => openInventoryForm(product)}
                                title="Editar"
                                aria-label={`Editar ${productTitle(product)}`}
                              >
                                <span className="material-symbols-outlined">edit_square</span>
                              </button>
                              <button
                                className="inv-action-btn delete"
                                onClick={() => openRemoveModal(product.id)}
                                title="Eliminar"
                                aria-label={`Eliminar ${productTitle(product)}`}
                              >
                                <span className="material-symbols-outlined">delete_forever</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <Pagination
                  page={inventoryPagination.page}
                  totalPages={inventoryPagination.totalPages}
                  start={inventoryPagination.start}
                  end={inventoryPagination.end}
                  total={filteredInventoryProducts.length}
                  onPageChange={setInventoryListPage}
                />

              </div>
            ) : (
              /* -- FORM ------------------------------------- */
              <div className="inventory-shell">
                <div className="page-header">
                  <button className="back-btn" onClick={openInventoryList}>
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                  </button>
                  <h2 className="page-header-title">
                    {editingProductId ? 'Editar producto' : 'Nuevo producto'}
                  </h2>
                </div>

                <div className="form-card">
                  <form onSubmit={handleStockSave} className="inventory-form">
                    <div className="form-group">
                      <label>Nombre del producto</label>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined">inventory_2</span>
                        <input
                          className="form-input"
                          value={stockForm.name}
                          onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })}
                          placeholder="Ej. Zaza Boyz"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Tipo</label>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined">spa</span>
                        <select
                          className="form-select"
                          value={stockForm.type}
                          onChange={(e) => setStockForm({ ...stockForm, type: e.target.value })}
                        >
                          {productTypes.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Gramo</label>
                        <div className="input-with-icon">
                          <span className="material-symbols-outlined">scale</span>
                          <select
                            className="form-select"
                            value={stockForm.size}
                            onChange={(e) => setStockForm({ ...stockForm, size: e.target.value })}
                          >
                            {sizeOptions.slice(1).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Cantidad</label>
                        <div className="input-with-icon">
                          <span className="material-symbols-outlined">pin</span>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            value={stockForm.stock}
                            onChange={(e) => setStockForm({ ...stockForm, stock: e.target.value })}
                            placeholder="20"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Precio compra (RD$)</label>
                        <div className="input-with-icon">
                          <span className="material-symbols-outlined">shopping_cart_checkout</span>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={stockForm.purchasePrice}
                            onChange={(e) => setStockForm({ ...stockForm, purchasePrice: e.target.value })}
                            placeholder="0.00"
                            required
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Precio venta (RD$)</label>
                        <div className="input-with-icon">
                          <span className="material-symbols-outlined">sell</span>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={stockForm.salePrice}
                            onChange={(e) => setStockForm({ ...stockForm, salePrice: e.target.value })}
                            placeholder="0.00"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="file-upload-group">
                      <span>Imagen</span>
                      <div className="file-upload-zone">
                        <input type="file" accept="image/*" onChange={handleImageFileChange} />
                        <div className="file-upload-icon">
                          <span className="material-symbols-outlined">cloud_upload</span>
                        </div>
                        <span className="file-upload-text">
                          {stockForm.imageName ? stockForm.imageName : 'Subir imagen'}
                        </span>
                      </div>
                    </div>

                    {stockForm.image && (
                      <div className="image-preview">
                        <img src={stockForm.image} alt="Vista previa" loading="lazy" decoding="async" />
                        <div className="image-preview-info">
                          <span className="image-preview-name">{stockForm.imageName || 'Imagen seleccionada'}</span>
                          <span className="image-preview-ok">
                            <span className="material-symbols-outlined" style={{ fontSize: '0.85rem', verticalAlign: 'middle', marginRight: 3 }}>check_circle</span>
                            Lista para guardar
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="form-actions">
                      <button type="button" className="ghost-btn" onClick={openInventoryList} disabled={savingAction === 'stock'}>
                        Cancelar
                      </button>
                      <button type="submit" className="primary-btn" disabled={savingAction === 'stock'}>
                        <span className="material-symbols-outlined">save</span>
                        {savingAction === 'stock' ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'caja' && (
          <CashModule
            transactions={transactions}
            summary={cashSummary}
            movementForm={movementForm}
            setMovementForm={setMovementForm}
            addCashMovement={addCashMovement}
            onRevertTransaction={revertTransaction}
            isSaving={savingAction === 'cash'}
          />
        )}

        {activeTab === 'deudas' && (
          <DebtsModule
            debts={debts}
            customers={globalCustomers}
            addDebtPayment={addDebtPayment}
            paymentSavingId={String(savingAction || '').startsWith('debt-payment-') ? Number(String(savingAction).replace('debt-payment-', '')) : null}
          />
        )}

        {activeTab === 'calculos' && (
          <EstimatesModule products={products} cashSummary={cashSummary} />
        )}

      </div>

      {/* -- BOTTOM NAV -------------------------------------- */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-btn ${activeTab === 'ventas' ? 'active' : ''}`}
          onClick={() => setActiveTab('ventas')}
        >
          <span className="material-symbols-outlined bottom-nav-icon">shopping_cart</span>
          <span className="bottom-nav-label">Ventas</span>
        </button>

        <button
          className={`bottom-nav-btn ${activeTab === 'inventario' ? 'active' : ''}`}
          onClick={() => { setActiveTab('inventario'); openInventoryList() }}
        >
          <span className="material-symbols-outlined bottom-nav-icon">smoke_free</span>
          <span className="bottom-nav-label">Droga</span>
        </button>

        <button
          className={`bottom-nav-btn ${activeTab === 'caja' ? 'active' : ''}`}
          onClick={() => setActiveTab('caja')}
        >
          <span className="material-symbols-outlined bottom-nav-icon">account_balance_wallet</span>
          <span className="bottom-nav-label">Caja</span>
        </button>

        <button
          className={`bottom-nav-btn ${activeTab === 'deudas' ? 'active' : ''}`}
          onClick={() => setActiveTab('deudas')}
        >
          <span className="material-symbols-outlined bottom-nav-icon">contract</span>
          <span className="bottom-nav-label">Deudas</span>
        </button>

        <button
          className={`bottom-nav-btn ${activeTab === 'calculos' ? 'active' : ''}`}
          onClick={() => setActiveTab('calculos')}
        >
          <span className="material-symbols-outlined bottom-nav-icon">calculate</span>
          <span className="bottom-nav-label">Calculos</span>
        </button>
      </nav>

      {/* -- MODAL CONFIRMAR ELIMINAR ------------------------ */}
      <ConfirmDialog
        open={confirmRemove.open}
        icon="warning"
        title="¿Eliminar producto?"
        body="Esta acción quitará el producto del inventario permanentemente. ¿Estás seguro?"
        onCancel={closeRemoveModal}
        onConfirm={removeProduct}
        confirmLabel="Sí, eliminar"
        isLoading={savingAction === 'delete-product'}
      />

      <ConfirmDialog
        open={priceEdit.open}
        icon="edit_square"
        iconBg="#f0f7f2"
        iconColor="var(--accent)"
        title="Editar precio"
        onCancel={closePriceEdit}
        onConfirm={saveCartPrice}
        confirmLabel="Aplicar"
        confirmClass="primary-btn"
      >
        <label className="price-edit-field">
          <span>Precio</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={priceEdit.value}
            onChange={(e) => setPriceEdit((current) => ({ ...current, value: e.target.value }))}
            autoFocus
            required
            onKeyDown={(e) => e.key === 'Enter' && saveCartPrice()}
          />
        </label>
      </ConfirmDialog>

      <CustomerPicker
        open={customerPickerOpen}
        customers={globalCustomers}
        selectedName={debtSaleForm.customerName}
        onSelect={(name) => setDebtSaleForm((current) => ({ ...current, customerName: name }))}
        onClose={() => setCustomerPickerOpen(false)}
      />

      <ProductImageModal
        src={viewImage?.src}
        name={viewImage?.name}
        onClose={() => setViewImage(null)}
      />

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App
