import { getDebts } from './debtsService'
import { getLogs } from './logsService'
import { getNotes } from './notesService'
import { getProducts } from './productsService'
import { getTransactions } from './transactionsService'

export async function getAppState() {
  const [products, transactions, debts, logs, notes] = await Promise.all([
    getProducts(),
    getTransactions(),
    getDebts(),
    getLogs(),
    getNotes(),
  ])

  return {
    products,
    transactions,
    debts,
    logs,
    notes,
  }
}
