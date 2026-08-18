import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const allowPublishableKey = args.has('--allow-publishable-key')

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const match = trimmed.match(/^([^=]+)=(.*)$/)
  if (!match) return null
  const key = match[1].trim()
  let value = match[2].trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

async function loadEnvFile(file) {
  const fullPath = path.join(root, file)
  if (!existsSync(fullPath)) return
  const content = await readFile(fullPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const entry = parseEnvLine(line)
    if (!entry) continue
    const [key, value] = entry
    if (process.env[key] == null) process.env[key] = value
  }
}

async function readJson(file) {
  const fullPath = path.join(root, 'data', file)
  const raw = await readFile(fullPath, 'utf8')
  return JSON.parse(raw)
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toBigIntNumber(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new Error(`ID inválido o fuera de rango seguro: ${value}`)
  }
  return number
}

function isoDate(value) {
  return value || new Date().toISOString()
}

function childId(parentId, index) {
  return toBigIntNumber(parentId) * 1000 + index + 1
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function productTitle(item) {
  return cleanText(item?.name, 'Producto')
}

function mapProduct(product) {
  const row = {
    id: toBigIntNumber(product.id),
    name: cleanText(product.name, 'Producto'),
    type: cleanText(product.type, 'Hybrida'),
    size: cleanText(product.size, '1 g'),
    purchase_price: toNumber(product.purchasePrice),
    sale_price: toNumber(product.salePrice),
    stock: toNumber(product.stock),
    image: product.image || '',
    created_at: isoDate(product.createdAt || product.date),
    updated_at: isoDate(product.updatedAt || product.date),
  }

  if (product.imageUrl) row.image_url = product.imageUrl

  return row
}

function mapSnapshotItem(item, parentKey, parentId, index, knownProductIds) {
  const productId = item.id ?? item.productId ?? item.product_id
  const safeProductId = productId != null && knownProductIds.has(Number(productId))
    ? toBigIntNumber(productId)
    : null

  return {
    id: childId(parentId, index),
    [parentKey]: toBigIntNumber(parentId),
    product_id: safeProductId,
    product_name: productTitle(item),
    product_type: cleanText(item.type || item.productType, 'Hybrida'),
    product_size: cleanText(item.size || item.productSize, '1 g'),
    quantity: toNumber(item.quantity),
    sale_price: toNumber(item.salePrice || item.sale_price),
  }
}

function mapDebt(debt) {
  return {
    id: toBigIntNumber(debt.id),
    customer_name: cleanText(debt.customerName),
    total_amount: toNumber(debt.totalAmount),
    paid_amount: toNumber(debt.paidAmount),
    remaining_amount: toNumber(debt.remainingAmount),
    status: cleanText(debt.status, 'pending'),
    created_at: isoDate(debt.date),
    updated_at: isoDate(debt.updatedAt || debt.date),
  }
}

function mapDebtPayment(payment, debtId) {
  return {
    id: toBigIntNumber(payment.id),
    debt_id: toBigIntNumber(debtId),
    amount: toNumber(payment.amount),
    payment_method: cleanText(payment.paymentMethod, 'cash'),
    note: payment.note || '',
    created_at: isoDate(payment.date),
  }
}

function mapTransaction(transaction, knownDebtIds, knownPaymentIds) {
  const debtId = transaction.debtId ?? transaction.debt_id
  const paymentId = transaction.paymentId ?? transaction.payment_id

  return {
    id: toBigIntNumber(transaction.id),
    type: cleanText(transaction.type),
    amount: toNumber(transaction.amount),
    payment_method: cleanText(transaction.paymentMethod, 'cash'),
    note: transaction.note || '',
    debt_id: debtId != null && knownDebtIds.has(Number(debtId)) ? toBigIntNumber(debtId) : null,
    payment_id: paymentId != null && knownPaymentIds.has(Number(paymentId)) ? toBigIntNumber(paymentId) : null,
    customer_name: transaction.customerName || '',
    total_amount: transaction.totalAmount == null ? null : toNumber(transaction.totalAmount),
    created_at: isoDate(transaction.date),
    updated_at: isoDate(transaction.updatedAt || transaction.date),
  }
}

function mapLog(log) {
  return {
    id: toBigIntNumber(log.id),
    type: cleanText(log.type, 'success'),
    entity: cleanText(log.entity),
    message: log.message || '',
    metadata: log.metadata || {},
    created_at: isoDate(log.date),
  }
}

async function upsertBatch(supabase, table, rows, options = {}) {
  if (rows.length === 0) return
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: 'id', ...options })
  if (error) {
    throw new Error(`${table}: ${error.message}`)
  }
}

async function main() {
  await loadEnvFile('.env')
  await loadEnvFile('.env.local')

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const key = serviceKey || publishableKey

  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL/VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  }

  if (apply && !serviceKey && !allowPublishableKey) {
    throw new Error(
      'Para aplicar la migracion usa SUPABASE_SERVICE_ROLE_KEY. ' +
      'Si sabes que tu RLS permite escritura anónima, agrega --allow-publishable-key.'
    )
  }

  const [productsJson, transactionsJson, debtsJson, logsJson] = await Promise.all([
    readJson('products.json'),
    readJson('transactions.json'),
    readJson('debts.json'),
    readJson('logs.json'),
  ])

  const products = productsJson.map(mapProduct)
  const knownProductIds = new Set(products.map((product) => product.id))
  const debts = debtsJson.map(mapDebt)
  const knownDebtIds = new Set(debts.map((debt) => debt.id))
  const debtItems = debtsJson.flatMap((debt) =>
    (debt.items || []).map((item, index) =>
      mapSnapshotItem(item, 'debt_id', debt.id, index, knownProductIds)
    )
  )
  const debtPayments = debtsJson.flatMap((debt) =>
    (debt.payments || []).map((payment) => mapDebtPayment(payment, debt.id))
  )
  const knownPaymentIds = new Set(debtPayments.map((payment) => payment.id))
  const transactions = transactionsJson.map((transaction) =>
    mapTransaction(transaction, knownDebtIds, knownPaymentIds)
  )
  const transactionItems = transactionsJson.flatMap((transaction) =>
    (transaction.items || []).map((item, index) =>
      mapSnapshotItem(item, 'transaction_id', transaction.id, index, knownProductIds)
    )
  )
  const logs = logsJson.map(mapLog)

  const summary = {
    products: products.length,
    debts: debts.length,
    debt_items: debtItems.length,
    debt_payments: debtPayments.length,
    transactions: transactions.length,
    transaction_items: transactionItems.length,
    logs: logs.length,
    orphan_item_snapshots: [...debtItems, ...transactionItems].filter((item) => item.product_id == null).length,
  }

  console.table(summary)

  if (!apply) {
    console.log('Dry run completo. Para aplicar: npm run migrate:json:supabase -- --apply')
    return
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  await upsertBatch(supabase, 'products', products)
  await upsertBatch(supabase, 'debts', debts)
  await upsertBatch(supabase, 'debt_items', debtItems)
  await upsertBatch(supabase, 'debt_payments', debtPayments)
  await upsertBatch(supabase, 'transactions', transactions)
  await upsertBatch(supabase, 'transaction_items', transactionItems)
  await upsertBatch(supabase, 'logs', logs)

  console.log('Migracion aplicada correctamente.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
