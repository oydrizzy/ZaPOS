import { supabase } from '../lib/supabase'
import { assertSupabaseResult } from './supabaseQuery'
import {
  makeClientId,
  mapTransactionFromDb,
} from './mappers'

const transactionSelect = `
  *,
  transaction_items (*)
`

export async function getTransactions() {
  const data = assertSupabaseResult(
    await supabase
      .from('transactions')
      .select(transactionSelect)
      .order('created_at', { ascending: true }),
    'No se pudieron cargar las transacciones'
  )

  return data.map(mapTransactionFromDb)
}

export async function getTransactionById(id) {
  const data = assertSupabaseResult(
    await supabase
      .from('transactions')
      .select(transactionSelect)
      .eq('id', id)
      .single(),
    'Movimiento no encontrado'
  )

  return mapTransactionFromDb(data)
}

export async function createTransaction(transaction) {
  if (transaction.type === 'sale') {
    return createSale(transaction)
  }

  if (transaction.type === 'income' || transaction.type === 'expense') {
    return createCashMovement(transaction)
  }

  throw new Error('Este movimiento debe registrarse con su servicio especializado')
}

function mapItemsToRpc(items = []) {
  return items.map((item) => ({
    product_id: item.productId ?? item.id,
    product_name: item.name,
    product_type: item.type || 'Hybrida',
    product_size: item.size,
    quantity: Number(item.quantity || 0),
    sale_price: Number(item.salePrice || 0),
  }))
}

export async function createSale(transaction) {
  const transactionId = transaction.id || makeClientId()
  const data = assertSupabaseResult(
    await supabase.rpc('create_sale', {
      p_transaction_id: transactionId,
      p_amount: Number(transaction.amount || 0),
      p_payment_method: transaction.paymentMethod || 'cash',
      p_note: transaction.note || '',
      p_items: mapItemsToRpc(transaction.items || []),
    }),
    'No se pudo registrar la venta'
  )

  return mapTransactionFromDb(data)
}

export async function createCashMovement({ type, amount, note }) {
  const transactionId = makeClientId()
  const data = assertSupabaseResult(
    await supabase.rpc('create_cash_movement', {
      p_transaction_id: transactionId,
      p_type: type === 'income' ? 'income' : 'expense',
      p_amount: Number(amount || 0),
      p_payment_method: 'cash',
      p_note: note?.trim() || '',
    }),
    'No se pudo registrar el movimiento de caja'
  )

  return mapTransactionFromDb(data)
}

export function createIncome(payload) {
  return createCashMovement({ ...payload, type: 'income' })
}

export function createExpense(payload) {
  return createCashMovement({ ...payload, type: 'expense' })
}

export async function deleteTransaction(id) {
  assertSupabaseResult(
    await supabase
      .from('transactions')
      .delete()
      .eq('id', id),
    'No se pudo eliminar el movimiento'
  )
}

export async function reverseTransaction(transactionId) {
  const transaction = await getTransactionById(transactionId)
  const rpcByType = {
    sale: 'reverse_sale',
    debt_sale: 'reverse_debt_sale',
    debt_payment: 'reverse_debt_payment',
    income: 'reverse_cash_movement',
    expense: 'reverse_cash_movement',
  }
  const rpcName = rpcByType[transaction.type]

  if (!rpcName) {
    throw new Error('Este tipo de movimiento no se puede revertir')
  }

  const data = assertSupabaseResult(
    await supabase.rpc(rpcName, {
      p_transaction_id: transaction.id,
    }),
    'No se pudo revertir el movimiento'
  )

  return mapTransactionFromDb(data || transaction)
}
