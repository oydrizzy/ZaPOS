import { supabase } from '../lib/supabase'
import { assertSupabaseResult } from './supabaseQuery'
import { mapNoteFromDb, mapNoteToDb } from './mappers'

const missingNotesCodes = new Set(['PGRST205', '42P01'])

function isMissingNotesTable(error) {
  return error && (missingNotesCodes.has(error.code) || String(error.message || '').includes("Could not find the table 'public.notas'"))
}

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

export async function createNote(note) {
  const data = assertSupabaseResult(
    await supabase
      .from('notas')
      .insert(mapNoteToDb({
        ...note,
        status: note.status || 'pendiente',
        pinned: note.pinned || false,
      }))
      .select()
      .single(),
    'No se pudo crear la nota'
  )

  return mapNoteFromDb(data)
}

export async function updateNote(id, note) {
  const data = assertSupabaseResult(
    await supabase
      .from('notas')
      .update(mapNoteToDb({ ...note, updatedAt: new Date().toISOString() }))
      .eq('id', id)
      .select()
      .single(),
    'No se pudo actualizar la nota'
  )

  return mapNoteFromDb(data)
}

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
