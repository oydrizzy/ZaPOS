import { getDebts } from './debtsService'
import { getLogs } from './logsService'
import { getNotes } from './notesService'
import { getProducts } from './productsService'
import { getTransactions } from './transactionsService'

export async function getAppState() {
  const [products, transactions, debts, logs, notesResult] = await Promise.all([
    getProducts(),
    getTransactions(),
    getDebts(),
    getLogs(),
    getNotes().then((notes) => ({ notes, notesError: null })).catch((error) => ({ notes: [], notesError: error.message })),
  ])

  return {
    products,
    transactions,
    debts,
    logs,
    ...notesResult,
  }
}
