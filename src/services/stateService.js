import { getDebts } from './debtsService'
import { getLogs } from './logsService'
import { getProducts } from './productsService'
import { getTransactions } from './transactionsService'

export async function getAppState() {
  const [products, transactions, debts, logs] = await Promise.all([
    getProducts(),
    getTransactions(),
    getDebts(),
    getLogs(),
  ])

  return {
    products,
    transactions,
    debts,
    logs,
  }
}
