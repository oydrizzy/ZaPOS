import { supabase } from '../lib/supabase'
import { assertSupabaseResult } from './supabaseQuery'
import { makeClientId, mapProductFromDb, mapProductToDb } from './mappers'

export async function getProducts() {
  const data = assertSupabaseResult(
    await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true }),
    'No se pudieron cargar los productos'
  )

  return data.map(mapProductFromDb)
}

export async function getProductById(id) {
  const data = assertSupabaseResult(
    await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single(),
    'Producto no encontrado'
  )

  return mapProductFromDb(data)
}

export async function createProduct(product) {
  const payload = mapProductToDb(
    {
      ...product,
      id: product.id || makeClientId(),
    },
    { includeId: true }
  )

  const data = assertSupabaseResult(
    await supabase
      .from('products')
      .insert(payload)
      .select()
      .single(),
    'No se pudo crear el producto'
  )

  return mapProductFromDb(data)
}

export async function updateProduct(id, product) {
  const data = assertSupabaseResult(
    await supabase
      .from('products')
      .update(mapProductToDb({ ...product, updatedAt: new Date().toISOString() }))
      .eq('id', id)
      .select()
      .single(),
    'No se pudo actualizar el producto'
  )

  return mapProductFromDb(data)
}

export async function deleteProduct(id) {
  const data = assertSupabaseResult(
    await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .select()
      .single(),
    'No se pudo eliminar el producto'
  )

  return mapProductFromDb(data)
}

export async function setProductStock(id, stock) {
  const data = assertSupabaseResult(
    await supabase
      .from('products')
      .update({ stock, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
    'No se pudo actualizar el stock'
  )

  return mapProductFromDb(data)
}

export async function adjustProductStock(id, delta) {
  const product = await getProductById(id)
  const nextStock = product.stock + Number(delta || 0)

  if (nextStock < 0) {
    throw new Error('No hay stock disponible')
  }

  return setProductStock(id, nextStock)
}
