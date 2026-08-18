import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const dataDir = resolve(__dirname, 'data')
const publicDir = resolve(__dirname, 'dist')

const files = {
  products: join(dataDir, 'products.json'),
  transactions: join(dataDir, 'transactions.json'),
  logs: join(dataDir, 'logs.json'),
  debts: join(dataDir, 'debts.json'),
}

const productTypes = ['Sativa', 'Indica', 'Hybrida']

const fallbackProducts = [
  {
    id: 1,
    name: 'Cafe Espresso',
    type: 'Hybrida',
    size: '3 g',
    purchasePrice: 2,
    salePrice: 3.5,
    stock: 24,
    image: 'https://picsum.photos/seed/cafe/200/200',
  },
  {
    id: 2,
    name: 'Agua Mineral',
    type: 'Hybrida',
    size: '1 g',
    purchasePrice: 0.4,
    salePrice: 1.8,
    stock: 42,
    image: 'https://picsum.photos/seed/agua/200/200',
  },
  {
    id: 3,
    name: 'Pan Integral',
    type: 'Hybrida',
    size: '2 g',
    purchasePrice: 1.2,
    salePrice: 2.2,
    stock: 18,
    image: 'https://picsum.photos/seed/pan/200/200',
  },
  {
    id: 4,
    name: 'Jugo Natural',
    type: 'Hybrida',
    size: '5 g',
    purchasePrice: 2.5,
    salePrice: 4,
    stock: 15,
    image: 'https://picsum.photos/seed/jugo/200/200',
  },
]

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

async function ensureDataFiles() {
  await mkdir(dataDir, { recursive: true })
  await ensureJson(files.products, fallbackProducts)
  await ensureJson(files.transactions, [])
  await ensureJson(files.logs, [])
  await ensureJson(files.debts, [])
}

async function ensureJson(file, value) {
  try {
    await stat(file)
  } catch {
    await writeJson(file, value)
  }
}

async function readJson(file, fallback = []) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    await writeJson(file, fallback)
    return fallback
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw Object.assign(new Error('JSON invalido'), { status: 400 })
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function sendError(res, error) {
  sendJson(res, error.status || 500, {
    error: error.message || 'Error interno del servidor',
  })
}

function makeId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function productTitle(product) {
  return `${product.name} (${product.type || 'Hybrida'})`
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

async function addLog(type, entity, message, metadata = {}) {
  const logs = await readJson(files.logs, [])
  const log = {
    id: makeId(),
    type,
    entity,
    message,
    metadata,
    date: new Date().toISOString(),
  }
  logs.push(log)
  await writeJson(files.logs, logs)
  return log
}

async function getState() {
  return {
    products: await readJson(files.products, fallbackProducts),
    transactions: await readJson(files.transactions, []),
    logs: await readJson(files.logs, []),
    debts: await readJson(files.debts, []),
  }
}

function cleanProduct(input, existing = {}) {
  const name = String(input.name || '').trim()
  const type = productTypes.includes(input.type) ? input.type : existing.type || 'Hybrida'
  const size = String(input.size || existing.size || '1 g').trim()
  const purchasePrice = Number(input.purchasePrice)
  const salePrice = Number(input.salePrice)
  const stock = Number(input.stock)
  const image = String(input.image || existing.image || '').trim()

  if (!name) throw Object.assign(new Error('El nombre del producto es requerido'), { status: 400 })
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    throw Object.assign(new Error('El precio de compra no es valido'), { status: 400 })
  }
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    throw Object.assign(new Error('El precio de venta no es valido'), { status: 400 })
  }
  if (!Number.isFinite(stock) || stock < 0) {
    throw Object.assign(new Error('El stock no es valido'), { status: 400 })
  }

  return {
    ...existing,
    name,
    type,
    size,
    purchasePrice,
    salePrice,
    stock,
    image: image || `https://picsum.photos/seed/${encodeURIComponent(name)}/200/200`,
  }
}

async function handleApi(req, res, url) {
  const method = req.method
  const path = url.pathname

  if (method === 'GET' && path === '/api/state') {
    return sendJson(res, 200, await getState())
  }

  if (method === 'GET' && path === '/api/logs') {
    return sendJson(res, 200, { logs: await readJson(files.logs, []) })
  }

  if (method === 'GET' && path === '/api/products') {
    return sendJson(res, 200, { products: await readJson(files.products, fallbackProducts) })
  }

  if (method === 'POST' && path === '/api/products') {
    const body = await readBody(req)
    const products = await readJson(files.products, fallbackProducts)
    const product = { id: makeId(), ...cleanProduct(body) }
    products.push(product)
    await writeJson(files.products, products)
    await addLog('success', 'product', `Producto creado: ${productTitle(product)}`, { productId: product.id })
    return sendJson(res, 201, { product, products, logs: await readJson(files.logs, []) })
  }

  const productMatch = path.match(/^\/api\/products\/(\d+)$/)
  if (productMatch && method === 'PUT') {
    const id = Number(productMatch[1])
    const body = await readBody(req)
    const products = await readJson(files.products, fallbackProducts)
    const index = products.findIndex((product) => product.id === id)
    if (index === -1) throw Object.assign(new Error('Producto no encontrado'), { status: 404 })
    const product = { id, ...cleanProduct(body, products[index]) }
    products[index] = product
    await writeJson(files.products, products)
    await addLog('success', 'product', `Producto actualizado: ${productTitle(product)}`, { productId: id })
    return sendJson(res, 200, { product, products, logs: await readJson(files.logs, []) })
  }

  if (productMatch && method === 'DELETE') {
    const id = Number(productMatch[1])
    const products = await readJson(files.products, fallbackProducts)
    const product = products.find((item) => item.id === id)
    if (!product) throw Object.assign(new Error('Producto no encontrado'), { status: 404 })
    const nextProducts = products.filter((item) => item.id !== id)
    await writeJson(files.products, nextProducts)
    await addLog('success', 'product', `Producto eliminado: ${productTitle(product)}`, { productId: id })
    return sendJson(res, 200, { product, products: nextProducts, logs: await readJson(files.logs, []) })
  }

  if (method === 'POST' && path === '/api/cart/add') {
    const { productId } = await readBody(req)
    const products = await readJson(files.products, fallbackProducts)
    const product = products.find((item) => item.id === Number(productId))
    if (!product) throw Object.assign(new Error('Producto no encontrado'), { status: 404 })
    if (product.stock <= 0) throw Object.assign(new Error('No hay stock disponible'), { status: 400 })
    product.stock -= 1
    await writeJson(files.products, products)
    await addLog('success', 'cart', `Agregado al carrito: ${productTitle(product)}`, { productId: product.id, quantity: 1 })
    return sendJson(res, 200, { product, products, logs: await readJson(files.logs, []) })
  }

  if (method === 'POST' && path === '/api/cart/remove') {
    const { productId, quantity = 1 } = await readBody(req)
    const qty = Math.max(1, Number(quantity) || 1)
    const products = await readJson(files.products, fallbackProducts)
    const product = products.find((item) => item.id === Number(productId))
    if (!product) throw Object.assign(new Error('Producto no encontrado'), { status: 404 })
    product.stock += qty
    await writeJson(files.products, products)
    await addLog('success', 'cart', `Eliminado del carrito: ${productTitle(product)}`, { productId: product.id, quantity: qty })
    return sendJson(res, 200, { product, products, logs: await readJson(files.logs, []) })
  }

  if (method === 'POST' && path === '/api/sales') {
    const body = await readBody(req)
    const items = Array.isArray(body.items) ? body.items : []
    const amount = Number(body.amount)
    const paymentMethod = body.paymentMethod === 'transfer' ? 'transfer' : body.paymentMethod === 'debt' ? 'debt' : 'cash'
    if (!items.length) throw Object.assign(new Error('La venta no tiene productos'), { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('El total de la venta no es valido'), { status: 400 })

    const transactions = await readJson(files.transactions, [])

    if (paymentMethod === 'debt') {
      const customerName = String(body.customerName || '').trim()
      const paidAmount = Number(body.paidAmount || 0)
      if (!customerName) throw Object.assign(new Error('El nombre del cliente es requerido'), { status: 400 })
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        throw Object.assign(new Error('El abono inicial no es valido'), { status: 400 })
      }
      if (paidAmount >= amount) {
        throw Object.assign(new Error('Para fiar, el abono debe ser menor que el total'), { status: 400 })
      }

      const debts = await readJson(files.debts, [])
      const now = new Date().toISOString()
      const initialPayment = paidAmount > 0
        ? { id: makeId(), amount: paidAmount, paymentMethod: 'cash', note: 'Abono inicial', date: now }
        : null
      const debt = {
        id: makeId(),
        customerName,
        totalAmount: amount,
        paidAmount,
        remainingAmount: amount - paidAmount,
        status: 'pending',
        date: now,
        updatedAt: now,
        items,
        payments: initialPayment ? [initialPayment] : [],
      }
      debts.push(debt)
      await writeJson(files.debts, debts)

      let transaction = null
      if (paidAmount > 0) {
        transaction = {
          id: makeId(),
          type: 'debt_sale',
          amount: paidAmount,
          paymentMethod: 'cash',
          date: now,
          note: `Abono inicial de ${customerName}`,
          debtId: debt.id,
          paymentId: initialPayment.id,
          customerName,
          totalAmount: amount,
          items,
        }
        transactions.push(transaction)
        await writeJson(files.transactions, transactions)
      }

      await addLog('success', 'debt', `Venta fiada a ${customerName}: RD$${debt.remainingAmount.toFixed(2)} pendiente`, {
        debtId: debt.id,
        customerName,
        paidAmount,
        remainingAmount: debt.remainingAmount,
      })
      return sendJson(res, 201, { transaction, transactions, debt, debts, logs: await readJson(files.logs, []) })
    }

    const transaction = {
      id: makeId(),
      type: 'sale',
      amount,
      paymentMethod,
      date: new Date().toISOString(),
      note: `Venta ${paymentMethod === 'cash' ? 'en efectivo' : 'por transferencia'}`,
      items,
    }
    transactions.push(transaction)
    await writeJson(files.transactions, transactions)
    await addLog('success', 'sale', `Venta registrada por RD$${amount.toFixed(2)}`, { transactionId: transaction.id })
    return sendJson(res, 201, { transaction, transactions, logs: await readJson(files.logs, []) })
  }

  if (method === 'POST' && path === '/api/cash-movements') {
    const body = await readBody(req)
    const amount = Number(body.amount)
    const type = body.type === 'income' ? 'income' : 'expense'
    if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('El monto no es valido'), { status: 400 })

    const transactions = await readJson(files.transactions, [])
    const transaction = {
      id: makeId(),
      type,
      amount,
      paymentMethod: 'cash',
      date: new Date().toISOString(),
      note: String(body.note || '').trim() || (type === 'income' ? 'Ingreso manual' : 'Egreso de caja'),
      items: [],
    }
    transactions.push(transaction)
    await writeJson(files.transactions, transactions)
    await addLog('success', 'cash', type === 'income' ? 'Ingreso registrado en caja' : 'Egreso registrado en caja', {
      transactionId: transaction.id,
      amount,
    })
    return sendJson(res, 201, { transaction, transactions, logs: await readJson(files.logs, []) })
  }

  const transactionRevertMatch = path.match(/^\/api\/transactions\/(\d+)\/revert$/)
  if (transactionRevertMatch && method === 'POST') {
    const id = Number(transactionRevertMatch[1])
    const transactions = await readJson(files.transactions, [])
    const transactionIndex = transactions.findIndex((entry) => entry.id === id)
    if (transactionIndex === -1) throw Object.assign(new Error('Movimiento no encontrado'), { status: 404 })

    const transaction = transactions[transactionIndex]
    const products = await readJson(files.products, fallbackProducts)
    const debts = await readJson(files.debts, [])
    let productsChanged = false
    let debtsChanged = false

    const restoreStock = () => {
      const items = Array.isArray(transaction.items) ? transaction.items : []
      for (const item of items) {
        const product = products.find((productItem) => productItem.id === Number(item.id))
        if (!product) {
          throw Object.assign(new Error(`No se puede revertir: falta el producto ${item.name || item.id}`), { status: 400 })
        }
        const quantity = Math.max(0, Number(item.quantity) || 0)
        product.stock = Number(product.stock || 0) + quantity
      }
      productsChanged = items.length > 0
    }

    if (transaction.type === 'sale') {
      restoreStock()
    } else if (transaction.type === 'debt_sale') {
      const debtIndex = debts.findIndex((debt) => debt.id === Number(transaction.debtId))
      if (debtIndex === -1) throw Object.assign(new Error('Deuda asociada no encontrada'), { status: 404 })

      const debt = debts[debtIndex]
      const payments = Array.isArray(debt.payments) ? debt.payments : []
      const hasExtraPayments = transaction.paymentId
        ? payments.some((payment) => payment.id !== transaction.paymentId)
        : payments.length > 1
      if (hasExtraPayments || roundMoney(debt.paidAmount) > roundMoney(transaction.amount)) {
        throw Object.assign(new Error('Primero revierte los abonos de esta deuda'), { status: 400 })
      }

      restoreStock()
      debts.splice(debtIndex, 1)
      debtsChanged = true
    } else if (transaction.type === 'debt_payment') {
      const debtIndex = debts.findIndex((debt) => debt.id === Number(transaction.debtId))
      if (debtIndex === -1) throw Object.assign(new Error('Deuda asociada no encontrada'), { status: 404 })

      const debt = debts[debtIndex]
      const payments = Array.isArray(debt.payments) ? [...debt.payments] : []
      let paymentIndex = transaction.paymentId
        ? payments.findIndex((payment) => payment.id === transaction.paymentId)
        : -1
      if (paymentIndex === -1) {
        for (let i = payments.length - 1; i >= 0; i -= 1) {
          if (roundMoney(payments[i].amount) === roundMoney(transaction.amount)) {
            paymentIndex = i
            break
          }
        }
      }
      if (paymentIndex === -1) throw Object.assign(new Error('Pago de deuda no encontrado'), { status: 404 })

      const payment = payments[paymentIndex]
      payments.splice(paymentIndex, 1)
      debt.payments = payments
      debt.paidAmount = Math.max(0, roundMoney(Number(debt.paidAmount || 0) - Number(payment.amount || transaction.amount)))
      debt.remainingAmount = Math.max(0, roundMoney(Number(debt.totalAmount || 0) - debt.paidAmount))
      debt.status = debt.remainingAmount <= 0 ? 'paid' : 'pending'
      debt.updatedAt = new Date().toISOString()
      debts[debtIndex] = debt
      debtsChanged = true
    } else if (transaction.type !== 'income' && transaction.type !== 'expense') {
      throw Object.assign(new Error('Este tipo de movimiento no se puede revertir'), { status: 400 })
    }

    const nextTransactions = transactions.filter((_, index) => index !== transactionIndex)
    if (productsChanged) await writeJson(files.products, products)
    if (debtsChanged) await writeJson(files.debts, debts)
    await writeJson(files.transactions, nextTransactions)

    const labels = {
      sale: 'venta',
      debt_sale: 'venta fiada',
      debt_payment: 'abono de deuda',
      income: 'ingreso',
      expense: 'egreso',
    }
    await addLog('success', 'cash', `Movimiento revertido: ${labels[transaction.type] || 'movimiento'} por RD$${Number(transaction.amount || 0).toFixed(2)}`, {
      transactionId: transaction.id,
      revertedType: transaction.type,
    })

    return sendJson(res, 200, {
      reverted: transaction,
      products,
      transactions: nextTransactions,
      debts,
      logs: await readJson(files.logs, []),
    })
  }

  const debtPaymentMatch = path.match(/^\/api\/debts\/(\d+)\/payments$/)
  if (debtPaymentMatch && method === 'POST') {
    const id = Number(debtPaymentMatch[1])
    const body = await readBody(req)
    const amount = Number(body.amount)
    const note = String(body.note || '').trim()
    const paymentMethod = body.paymentMethod === 'transfer' ? 'transfer' : 'cash'
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error('El abono no es valido'), { status: 400 })
    }

    const debts = await readJson(files.debts, [])
    const index = debts.findIndex((debt) => debt.id === id)
    if (index === -1) throw Object.assign(new Error('Deuda no encontrada'), { status: 404 })
    const debt = debts[index]
    const remaining = Number(debt.remainingAmount || 0)
    if (amount > remaining) {
      throw Object.assign(new Error(`El abono no puede pasar de RD$${remaining.toFixed(2)}`), { status: 400 })
    }

    const now = new Date().toISOString()
    const payment = {
      id: makeId(),
      amount,
      paymentMethod,
      note,
      date: now,
    }
    debt.payments = Array.isArray(debt.payments) ? [...debt.payments, payment] : [payment]
    debt.paidAmount = Number(debt.paidAmount || 0) + amount
    debt.remainingAmount = Math.max(0, Number(debt.totalAmount || 0) - debt.paidAmount)
    debt.status = debt.remainingAmount <= 0 ? 'paid' : 'pending'
    debt.updatedAt = now
    debts[index] = debt
    await writeJson(files.debts, debts)

    const transactions = await readJson(files.transactions, [])
    const transaction = {
      id: makeId(),
      type: 'debt_payment',
      amount,
      paymentMethod,
      date: now,
      note: note || `Abono de ${debt.customerName}`,
      debtId: debt.id,
      paymentId: payment.id,
      customerName: debt.customerName,
      items: debt.items || [],
    }
    transactions.push(transaction)
    await writeJson(files.transactions, transactions)

    await addLog('success', 'debt', `Abono de ${debt.customerName}: RD$${amount.toFixed(2)}`, {
      debtId: debt.id,
      paymentId: payment.id,
      remainingAmount: debt.remainingAmount,
    })

    return sendJson(res, 201, { debt, debts, transaction, transactions, logs: await readJson(files.logs, []) })
  }

  throw Object.assign(new Error('Ruta no encontrada'), { status: 404 })
}

async function serveStatic(req, res, url) {
  let requestedPath = decodeURIComponent(url.pathname)
  if (requestedPath === '/') requestedPath = '/index.html'
  const filePath = resolve(publicDir, `.${requestedPath}`)
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const file = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    })
    res.end(file)
  } catch {
    const index = await readFile(join(publicDir, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(index)
  }
}

await ensureDataFiles()

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    await serveStatic(req, res, url)
  } catch (error) {
    sendError(res, error)
  }
})

const port = Number(process.env.PORT || 3001)
server.listen(port, () => {
  console.log(`JSON POS API running at http://localhost:${port}`)
})
