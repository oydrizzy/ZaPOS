export function assertSupabaseResult(result, fallbackMessage = 'Error consultando Supabase') {
  if (result.error) {
    console.error(fallbackMessage, result.error)
    throw new Error(result.error.message || fallbackMessage)
  }

  return result.data
}
