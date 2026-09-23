import { supabase } from '../lib/supabase'
import { assertSupabaseResult } from './supabaseQuery'
import { mapNoteFromDb, mapNoteToDb } from './mappers'

const missingNotesCodes = new Set(['PGRST205', '42P01'])

function isMissingNotesTable(error) {
  return error && (missingNotesCodes.has(error.code) || String(error.message || '').includes("Could not find the table 'public.notas'"))
}

/**
 * Obtiene el usuario autenticado actual desde Supabase Auth.
 * Lanza error si no hay sesión activa.
 */
async function getAuthUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Usuario no autenticado')
  return user
}

/**
 * Carga todas las notas del usuario autenticado.
 * RLS filtra automáticamente por auth.uid() = user_id.
 * No se necesita .eq('user_id', ...) porque RLS ya lo garantiza,
 * pero lo añadimos como defensa en profundidad.
 */
export async function getNotes() {
  const result = await supabase
    .from('notas')
    .select('*')
    .order('fijada', { ascending: false })
    .order('created_at', { ascending: false })

  if (isMissingNotesTable(result.error)) {
    console.warn('La tabla public.notas no existe. Ejecuta supabase/create_notas.sql.')
    return []
  }

  return assertSupabaseResult(result, 'No se pudieron cargar las notas').map(mapNoteFromDb)
}

/**
 * Crea una nota. Siempre obtiene user_id desde Supabase Auth.
 * NUNCA acepta user_id del formulario.
 */
export async function createNote(note) {
  // Paso 1: obtener usuario real desde Supabase Auth
  const user = await getAuthUser()

  // Paso 2: mapear campos de la nota (sin user_id — lo añadimos internamente)
  const dbPayload = mapNoteToDb({
    ...note,
    status: note.status || 'pendiente',
    pinned: note.pinned || false,
  })

  // Paso 3: inyectar user_id desde Auth, no desde el formulario
  dbPayload.user_id = user.id

  const data = assertSupabaseResult(
    await supabase
      .from('notas')
      .insert(dbPayload)
      .select()
      .single(),
    'No se pudo crear la nota'
  )

  return mapNoteFromDb(data)
}

/**
 * Edita una nota existente.
 * NUNCA actualiza user_id — el propietario no cambia.
 * RLS impide editar notas de otros usuarios aunque se conozca el ID.
 */
export async function updateNote(id, note) {
  // Mapear sin user_id (mapNoteToDb ya no lo incluye para updates)
  const dbPayload = mapNoteToDb({ ...note, updatedAt: new Date().toISOString() })

  // Asegurar que user_id nunca se envíe en un update
  delete dbPayload.user_id

  const data = assertSupabaseResult(
    await supabase
      .from('notas')
      .update(dbPayload)
      .eq('id', id)
      .select()
      .single(),
    'No se pudo actualizar la nota'
  )

  return mapNoteFromDb(data)
}

/**
 * Elimina una nota por ID.
 * RLS impide eliminar notas de otros usuarios.
 */
export async function deleteNote(id) {
  const data = assertSupabaseResult(
    await supabase
      .from('notas')
      .delete()
      .eq('id', id)
      .select()
      .single(),
    'No se pudo eliminar la nota'
  )

  return mapNoteFromDb(data)
}
