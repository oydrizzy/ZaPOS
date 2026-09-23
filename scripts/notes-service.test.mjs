import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'zapos-notes-services-'))
let responses = []
let writes = []
let authUser = { id: 'authenticated-user' }
const row = {
  id: 1,
  titulo: 'Nota guardada',
  descripcion: 'Contenido',
  prioridad: 'urgente',
  estado: 'pendiente',
  fijada: true,
  fecha_nota: '2026-09-23T16:00:00Z',
  tipo_relacion: 'producto',
  id_relacion: 8,
  user_id: 'authenticated-user'
}
globalThis.__supabaseNoteTest = {
  auth: { getUser: async () => ({ data: { user: authUser }, error: null }) },
  from(table) {
    assert.equal(table, 'notas')
    const request = {
      select() {
        return this
      },
      order() {
        return this
      },
      eq() {
        return this
      },
      insert(payload) {
        writes.push(payload)
        return this
      },
      update(payload) {
        writes.push(payload)
        return this
      },
      single() {
        return Promise.resolve(responses.shift())
      },
      then(resolve, reject) {
        return Promise.resolve(responses.shift()).then(resolve, reject)
      }
    }
    return request
  }
}
globalThis.__stateTest = {
  getProducts: async () => [{ id: 1, stock: 8 }],
  getTransactions: async () => [{ id: 2, amount: 150 }],
  getDebts: async () => [],
  getLogs: async () => [],
  getNotes: async () => {
    throw new Error('notes unavailable')
  }
}
const plugin = {
  name: 'supabase-fixture',
  setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({
      path: 'supabase',
      namespace: 'fixture'
    }))
    builder.onLoad({ filter: /supabase/, namespace: 'fixture' }, () => ({
      contents: 'export const supabase = globalThis.__supabaseNoteTest;'
    }))
  }
}
async function load(entry, name, plugins) {
  const outfile = join(directory, `${name}.mjs`)
  await build({
    entryPoints: [entry],
    outfile,
    platform: 'node',
    format: 'esm',
    bundle: true,
    plugins,
    logLevel: 'silent'
  })
  return import(pathToFileURL(outfile))
}
const services = await load('src/services/notesService.js', 'service', [plugin])
const state = await load('src/services/stateService.js', 'state', [
  {
    name: 'state-fixtures',
    setup(builder) {
      builder.onResolve(
        { filter: /^\.\/(debts|logs|notes|products|transactions)Service$/ },
        (args) => ({ path: args.path, namespace: 'state' })
      )
      builder.onLoad({ filter: /.*/, namespace: 'state' }, ({ path }) => {
        const name = {
          './debtsService': 'getDebts',
          './logsService': 'getLogs',
          './notesService': 'getNotes',
          './productsService': 'getProducts',
          './transactionsService': 'getTransactions'
        }[path]
        return {
          contents: `export const ${name} = (...args) => globalThis.__stateTest.${name}(...args);`
        }
      })
    }
  }
])
after(async () => rm(directory, { recursive: true, force: true }))

test('creating notes uses authenticated ownership and preserves every note field', async () => {
  writes = []
  responses = [{ data: row, error: null }]
  const saved = await services.createNote({
    title: row.titulo,
    description: row.descripcion,
    priority: 'urgente',
    status: 'pendiente',
    pinned: true,
    noteDate: row.fecha_nota,
    relationType: 'producto',
    relationId: 8,
    userId: 'untrusted-user',
    user_id: 'untrusted-user'
  })
  assert.equal(writes[0].user_id, 'authenticated-user')
  assert.equal(writes[0].fecha_nota, row.fecha_nota)
  assert.equal(writes[0].id_relacion, 8)
  assert.equal(saved.pinned, true)
  assert.equal(saved.description, 'Contenido')
})

test('legacy ownership fallback only retries a missing user_id column', async () => {
  writes = []
  responses = [
    {
      data: null,
      error: {
        code: 'PGRST204',
        message: "Could not find the 'user_id' column of 'notas'"
      }
    },
    {
      data: { ...row, user_id: undefined, usuario_id: 'authenticated-user' },
      error: null
    }
  ]
  const saved = await services.createNote({ title: 'Legado' })
  assert.equal(writes.length, 2)
  assert.equal(writes[1].usuario_id, 'authenticated-user')
  assert.equal(Object.hasOwn(writes[1], 'user_id'), false)
  assert.equal(saved.userId, 'authenticated-user')
})

test('unauthenticated writes fail before reaching the database', async () => {
  writes = []
  authUser = null
  await assert.rejects(
    services.createNote({ title: 'Blocked' }),
    /no autenticado/
  )
  assert.equal(writes.length, 0)
  authUser = { id: 'authenticated-user' }
})

test('clearing optional fields and unpinning persists without changing ownership', async () => {
  writes = []
  responses = [{ data: row, error: null }]
  await services.updateNote(1, {
    title: 'Editada',
    description: '',
    noteDate: '',
    relationType: '',
    relationId: '',
    pinned: false,
    status: 'completada',
    userId: 'other-user'
  })
  assert.equal(writes[0].descripcion, null)
  assert.equal(writes[0].fecha_nota, null)
  assert.equal(writes[0].id_relacion, null)
  assert.equal(writes[0].fijada, false)
  assert.equal(writes[0].estado, 'completada')
  assert.equal(Object.hasOwn(writes[0], 'user_id'), false)
  assert.equal(Object.hasOwn(writes[0], 'usuario_id'), false)
})

test('missing notes table is an explicit error; empty table remains a valid result', async () => {
  responses = [
    { error: { code: 'PGRST205', message: 'missing table' }, data: null }
  ]
  await assert.rejects(services.getNotes(), /no est/)
  responses = [{ error: null, data: [] }]
  assert.deepEqual(await services.getNotes(), [])
})

test('notes failure does not block operational state or change stock and money', async () => {
  const data = await state.getAppState()
  assert.deepEqual(data.products, [{ id: 1, stock: 8 }])
  assert.deepEqual(data.transactions, [{ id: 2, amount: 150 }])
  assert.equal(data.notesError, 'notes unavailable')
})
