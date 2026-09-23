// Bound read operations only; timing out a write could invite duplicate submissions.
export function readWithTimeout(operation, timeoutMs = 15000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('La conexión está tardando demasiado. Revisa tu conexión e inténtalo otra vez.'))
    }, timeoutMs)
  })
  return Promise.race([Promise.resolve().then(operation), timeout])
    .finally(() => clearTimeout(timer))
}
