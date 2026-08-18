import { supabase } from '../lib/supabase'
import { assertSupabaseResult } from './supabaseQuery'
import {
  makeClientId,
  mapDebtFromDb,
  mapDebtItemToDb,
  mapDebtPaymentFromDb,
  mapDebtPaymentToDb,
  mapDebtToDb,
  mapTransactionFromDb,
} from './mappers'

const debtSelect = `
  *,
  debt_items (*),
  debt_payments (*)
`

export async function getDebts() {
  const data = assertSupabaseResult(
    await supabase
      .from('debts')
      .select(debtSelect)
      .order('created_at', { ascending: true }),
    'No se pudieron cargar las deudas'
  )

  return data.map(mapDebtFromDb)
}

export async function getDebtById(id) {
  const data = assertSupabaseResult(
    await supabase
      .from('debts')
      .select(debtSelect)
      .eq('id', id)
      .single(),
    'Deuda no encontrada'
  )

  return mapDebtFromDb(data)
}

export async function createDebtRecord(debt) {
  const debtId = debt.id || makeClientId()
  const now = debt.date || new Date().toISOString()
  const payload = mapDebtToDb(
    {
      ...debt,
      id: debtId,
      paidAmount: debt.paidAmount || 0,
      remainingAmount: debt.remainingAmount ?? debt.totalAmount,
      status: debt.status || 'pending',
      date: now,
      updatedAt: now,
    },
    { includeId: true }
  )

  assertSupabaseResult(
    await supabase
      .from('debts')
      .insert(payload),
    'No se pudo crear la deuda'
  )

  if (debt.items?.length) {
    assertSupabaseResult(
      await supabase
        .from('debt_items')
        .insert(debt.items.map((item) => mapDebtItemToDb(item, debtId))),
      'No se pudieron guardar los productos de la deuda'
    )
  }

  if (debt.payments?.length) {
    assertSupabaseResult(
      await supabase
        .from('debt_payments')
        .insert(debt.payments.map((payment) => mapDebtPaymentToDb(payment, debtId))),
      'No se pudieron guardar los abonos de la deuda'
    )
  }

  return getDebtById(debtId)
}

export async function createDebtSale(payload) {
  const paidAmount = Number(payload.paidAmount || 0)
  const data = assertSupabaseResult(
    await supabase.rpc('create_debt_sale', {
      p_debt_id: payload.debtId || makeClientId(),
      p_transaction_id: payload.transactionId || makeClientId(),
      p_payment_id: paidAmount > 0 ? payload.paymentId || makeClientId() : null,
      p_customer_name: payload.customerName,
      p_total_amount: Number(payload.totalAmount || 0),
      p_paid_amount: paidAmount,
      p_items: mapDebtItemsToRpc(payload.items || []),
    }),
    'No se pudo registrar la venta fiada'
  )

  return {
    debt: mapDebtFromDb(data.debt),
    transaction: data.transaction ? mapTransactionFromDb(data.transaction) : null,
  }
}

export async function addDebtPayment(debtId, payment) {
  const data = assertSupabaseResult(
    await supabase.rpc('register_debt_payment', {
      p_payment_id: payment.id || makeClientId(),
      p_transaction_id: payment.transactionId || makeClientId(),
      p_debt_id: debtId,
      p_amount: Number(payment.amount || 0),
      p_payment_method: payment.paymentMethod || 'cash',
      p_note: payment.note || '',
    }),
    'No se pudo registrar el abono'
  )

  return {
    debt: mapDebtFromDb(data.debt),
    transaction: data.transaction ? mapTransactionFromDb(data.transaction) : null,
  }
}

function mapDebtItemsToRpc(items = []) {
  return items.map((item) => ({
    product_id: item.productId ?? item.id,
    product_name: item.name,
    product_type: item.type || 'Hybrida',
    product_size: item.size,
    quantity: Number(item.quantity || 0),
    sale_price: Number(item.salePrice || 0),
  }))
}

export async function deleteDebtPayment(paymentId) {
  const data = assertSupabaseResult(
    await supabase
      .from('debt_payments')
      .delete()
      .eq('id', paymentId)
      .select()
      .single(),
    'No se pudo eliminar el abono'
  )

  return mapDebtPaymentFromDb(data)
}

export async function deleteDebt(id) {
  const data = assertSupabaseResult(
    await supabase
      .from('debts')
      .delete()
      .eq('id', id)
      .select(debtSelect)
      .single(),
    'No se pudo eliminar la deuda'
  )

  return mapDebtFromDb(data)
}
