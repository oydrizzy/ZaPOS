import { supabase } from '../lib/supabase'
import { assertSupabaseResult } from './supabaseQuery'
import { makeClientId, mapLogFromDb, mapLogToDb } from './mappers'

export async function getLogs() {
  const data = assertSupabaseResult(
    await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: true }),
    'No se pudieron cargar los logs'
  )

  return data.map(mapLogFromDb)
}

export async function createLog(type, entity, message, metadata = {}) {
  const payload = mapLogToDb(
    {
      id: makeClientId(),
      type,
      entity,
      message,
      metadata,
      date: new Date().toISOString(),
    },
    { includeId: true }
  )

  const data = assertSupabaseResult(
    await supabase
      .from('logs')
      .insert(payload)
      .select()
      .single(),
    'No se pudo crear el log'
  )

  return mapLogFromDb(data)
}
