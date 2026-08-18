export function makeClientId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

export function compactDbObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  )
}

export function mapProductFromDb(row = {}) {
  return {
    id: Number(row.id),
    name: row.name || '',
    type: row.type || 'Hybrida',
    size: row.size || '1 g',
    purchasePrice: Number(row.purchase_price || 0),
    salePrice: Number(row.sale_price || 0),
    stock: Number(row.stock || 0),
    image: row.image || row.image_url || '',
    imageUrl: row.image_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapProductToDb(product = {}, { includeId = false } = {}) {
  return compactDbObject({
    id: includeId ? product.id : undefined,
    name: product.name,
    type: product.type || 'Hybrida',
    size: product.size,
    purchase_price: product.purchasePrice,
    sale_price: product.salePrice,
    stock: product.stock,
    image: product.image,
    image_url: product.imageUrl,
    updated_at: product.updatedAt,
  })
}

export function mapTransactionItemFromDb(row = {}) {
  return {
    id: row.product_id == null ? null : Number(row.product_id),
    itemId: row.id == null ? undefined : Number(row.id),
    name: row.product_name || '',
    type: row.product_type || 'Hybrida',
    size: row.product_size || '1 g',
    quantity: Number(row.quantity || 0),
    salePrice: Number(row.sale_price || 0),
  }
}

export function mapTransactionItemToDb(item = {}, transactionId) {
  return compactDbObject({
    transaction_id: transactionId,
    product_id: item.id ?? item.productId ?? null,
    product_name: item.name,
    product_type: item.type || 'Hybrida',
    product_size: item.size,
    quantity: item.quantity,
    sale_price: item.salePrice,
  })
}

export function mapTransactionFromDb(row = {}) {
  const items = row.transaction_items || row.items || []

  return {
    id: Number(row.id),
    type: row.type,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || 'cash',
    date: row.created_at,
    updatedAt: row.updated_at,
    note: row.note || '',
    debtId: row.debt_id == null ? undefined : Number(row.debt_id),
    paymentId: row.payment_id == null ? undefined : Number(row.payment_id),
    customerName: row.customer_name || '',
    totalAmount: row.total_amount == null ? undefined : Number(row.total_amount),
    items: items.map(mapTransactionItemFromDb),
  }
}

export function mapTransactionToDb(transaction = {}, { includeId = true } = {}) {
  return compactDbObject({
    id: includeId ? transaction.id : undefined,
    type: transaction.type,
    amount: transaction.amount,
    payment_method: transaction.paymentMethod || 'cash',
    note: transaction.note,
    debt_id: transaction.debtId,
    payment_id: transaction.paymentId,
    customer_name: transaction.customerName,
    total_amount: transaction.totalAmount,
    created_at: transaction.date,
    updated_at: transaction.updatedAt,
  })
}

export function mapDebtItemFromDb(row = {}) {
  return {
    id: row.product_id == null ? null : Number(row.product_id),
    itemId: row.id == null ? undefined : Number(row.id),
    name: row.product_name || '',
    type: row.product_type || 'Hybrida',
    size: row.product_size || '1 g',
    quantity: Number(row.quantity || 0),
    salePrice: Number(row.sale_price || 0),
  }
}

export function mapDebtItemToDb(item = {}, debtId) {
  return compactDbObject({
    debt_id: debtId,
    product_id: item.id ?? item.productId ?? null,
    product_name: item.name,
    product_type: item.type || 'Hybrida',
    product_size: item.size,
    quantity: item.quantity,
    sale_price: item.salePrice,
  })
}

export function mapDebtPaymentFromDb(row = {}) {
  return {
    id: Number(row.id),
    debtId: row.debt_id == null ? undefined : Number(row.debt_id),
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || 'cash',
    note: row.note || '',
    date: row.created_at,
  }
}

export function mapDebtPaymentToDb(payment = {}, debtId) {
  return compactDbObject({
    id: payment.id,
    debt_id: debtId ?? payment.debtId,
    amount: payment.amount,
    payment_method: payment.paymentMethod || 'cash',
    note: payment.note,
    created_at: payment.date,
  })
}

export function mapDebtFromDb(row = {}) {
  const items = row.debt_items || row.items || []
  const payments = row.debt_payments || row.payments || []

  return {
    id: Number(row.id),
    customerName: row.customer_name || '',
    totalAmount: Number(row.total_amount || 0),
    paidAmount: Number(row.paid_amount || 0),
    remainingAmount: Number(row.remaining_amount || 0),
    status: row.status || 'pending',
    date: row.created_at,
    updatedAt: row.updated_at,
    items: items.map(mapDebtItemFromDb),
    payments: payments.map(mapDebtPaymentFromDb),
  }
}

export function mapDebtToDb(debt = {}, { includeId = true } = {}) {
  return compactDbObject({
    id: includeId ? debt.id : undefined,
    customer_name: debt.customerName,
    total_amount: debt.totalAmount,
    paid_amount: debt.paidAmount,
    remaining_amount: debt.remainingAmount,
    status: debt.status || 'pending',
    created_at: debt.date,
    updated_at: debt.updatedAt,
  })
}

export function mapLogFromDb(row = {}) {
  return {
    id: Number(row.id),
    type: row.type || 'success',
    entity: row.entity || '',
    message: row.message || '',
    metadata: row.metadata || {},
    date: row.created_at,
  }
}

export function mapLogToDb(log = {}, { includeId = true } = {}) {
  return compactDbObject({
    id: includeId ? log.id : undefined,
    type: log.type || 'success',
    entity: log.entity,
    message: log.message,
    metadata: log.metadata || {},
    created_at: log.date,
  })
}
