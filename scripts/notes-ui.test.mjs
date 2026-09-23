import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><div id="test-root"></div>', {
  url: 'http://localhost/'
})
for (const name of [
  'window',
  'document',
  'HTMLElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'localStorage',
  'sessionStorage'
])
  globalThis[name] = dom.window[name]
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const root = createRoot(document.getElementById('test-root'))
const directory = await mkdtemp(join(tmpdir(), 'zapos-notes-test-'))
const notifications = []
let store = []
let failRead = false
let failWrite = false
let creates = 0
let updates = 0
let openedRelation = null
const now = '2026-09-23T16:00:00.000Z'
const makeNote = (id, extra = {}) => ({
  id,
  title: `Nota ${id}`,
  description: 'Contenido guardado',
  priority: 'normal',
  status: 'pendiente',
  pinned: false,
  noteDate: '',
  relationType: '',
  relationId: '',
  createdAt: now,
  updatedAt: now,
  ...extra
})
const products = [
  {
    id: 10,
    name: 'Producto de prueba',
    type: 'Hybrida',
    size: '3 g',
    purchasePrice: 100,
    salePrice: 150,
    stock: 4,
    image: ''
  }
]

globalThis.__notesServiceTest = {
  getNotes: async () => {
    if (failRead) throw new Error('Sin conexion')
    return store.map((note) => ({ ...note }))
  },
  createNote: async (draft) => {
    creates++
    if (failWrite) throw new Error('No se pudo guardar')
    const note = makeNote(100 + creates, draft)
    store.push(note)
    return note
  },
  updateNote: async (id, draft) => {
    updates++
    if (failWrite) throw new Error('No se pudo guardar')
    const note = { ...draft, id, updatedAt: now }
    store = store.map((item) => (item.id === id ? note : item))
    return note
  },
  deleteNote: async (id) => {
    const note = store.find((item) => item.id === id)
    store = store.filter((item) => item.id !== id)
    return note
  }
}
globalThis.__appServiceTest = {
  getCurrentSession: async () => ({ user: { id: 'test-user' } }),
  subscribeToAuthChanges: () => () => {},
  getAppState: async () => ({
    products,
    debts: [],
    transactions: [],
    logs: [],
    notes: []
  })
}
const mockPlugin = {
  name: 'isolated-services',
  setup(builder) {
    builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
      path: pathToFileURL(require.resolve(args.path)).href,
      external: true
    }))
    builder.onResolve({ filter: /services\/notesService$/ }, () => ({
      path: 'notes',
      namespace: 'mock'
    }))
    builder.onResolve({ filter: /services\/authService$/ }, () => ({
      path: 'auth',
      namespace: 'mock'
    }))
    builder.onResolve({ filter: /^\.\/services$/ }, () => ({
      path: 'app',
      namespace: 'mock'
    }))
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => {
      const names =
        path === 'notes'
          ? ['getNotes', 'createNote', 'updateNote', 'deleteNote']
          : path === 'auth'
            ? [
                'getCurrentSession',
                'subscribeToAuthChanges',
                'signIn',
                'signOut'
              ]
            : [
                'addDebtPayment',
                'createCashMovement',
                'createDebtSale',
                'createLog',
                'createProduct',
                'createSale',
                'deleteProduct',
                'getAppState',
                'reverseTransaction',
                'updateProduct'
              ]
      const source =
        path === 'notes' ? '__notesServiceTest' : '__appServiceTest'
      return {
        contents: names
          .map(
            (name) =>
              `export const ${name} = (...args) => globalThis.${source}.${name}(...args);`
          )
          .join('\n'),
        loader: 'js'
      }
    })
  }
}
async function loadComponent(entry, name) {
  const outfile = join(directory, `${name}.mjs`)
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.png': 'dataurl' },
    plugins: [mockPlugin],
    logLevel: 'silent'
  })
  return (await import(pathToFileURL(outfile))).default
}
const Notes = await loadComponent('src/components/NotesModule.jsx', 'notes')
const App = await loadComponent('src/App.jsx', 'app')
async function renderNotes() {
  await act(async () => root.render(null))
  await act(async () =>
    root.render(
      React.createElement(Notes, {
        products,
        debts: [],
        transactions: [],
        notify: (...args) => notifications.push(args),
        onOpenRelation: (note) => {
          openedRelation = note
        }
      })
    )
  )
}
const findButton = (text) =>
  [...document.querySelectorAll('button')].find((button) =>
    button.textContent.includes(text)
  )
const byLabel = (label) => document.querySelector(`[aria-label="${label}"]`)
async function click(element) {
  assert.ok(element, 'control exists')
  await act(async () => element.click())
}
async function type(element, value) {
  assert.ok(element, 'input exists')
  const prototype =
    element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () =>
    document
      .querySelector('form.note-editor')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  )
}

after(async () => {
  await act(async () => root.unmount())
  dom.window.close()
  await rm(directory, { recursive: true, force: true })
})

test('notes survive remount; create, edit, pin, complete and delete preserve data', async () => {
  store = []
  await renderNotes()
  await click(findButton('Nueva nota'))
  assert.ok(
    document.querySelector('.notes-overlay').parentElement === document.body,
    'modal mounts on document.body'
  )
  assert.equal(
    document
      .querySelector('.note-editor-footer button[type="submit"]')
      .textContent.includes('Crear nota'),
    true
  )
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    )
  )
  assert.ok(
    document.querySelector('.note-editor').contains(document.activeElement),
    'keyboard focus stays in the modal'
  )
  assert.notEqual(document.activeElement.id, 'note-editor-heading')
  await type(byLabel('T\u00edtulo de la nota'), 'Pedido especial')
  await type(byLabel('Contenido de la nota'), 'Primera linea\nSegunda linea')
  await submit()
  assert.equal(store.length, 1)
  assert.equal(store[0].description, 'Primera linea\nSegunda linea')
  await renderNotes()
  await click(byLabel('Abrir nota: Pedido especial'))
  await type(byLabel('T\u00edtulo de la nota'), 'Pedido actualizado')
  await submit()
  await click(byLabel('Fijar nota'))
  assert.equal(store[0].pinned, true)
  await click(byLabel('Completar nota'))
  assert.equal(store[0].status, 'completada')
  assert.equal(store[0].description, 'Primera linea\nSegunda linea')
  await click(byLabel('Abrir nota: Pedido actualizado'))
  await click(byLabel('Eliminar nota'))
  await click(findButton('Cancelar'))
  assert.equal(store.length, 1)
  await click(byLabel('Eliminar nota'))
  await click(findButton('Eliminar'))
  assert.equal(store.length, 0)
  assert.equal(document.querySelector('[role="dialog"]'), null)
})

test('failed saves retain draft and dirty close requires confirmation', async () => {
  store = []
  await renderNotes()
  await click(findButton('Nueva nota'))
  await type(byLabel('T\u00edtulo de la nota'), 'No perder')
  failWrite = true
  await submit()
  failWrite = false
  assert.equal(byLabel('T\u00edtulo de la nota').value, 'No perder')
  assert.equal(notifications.at(-1)[1], 'error')
  await click(byLabel('Cerrar nota'))
  assert.ok(document.querySelector('[role="alertdialog"]'))
  await click(findButton('Cancelar'))
  assert.equal(byLabel('T\u00edtulo de la nota').value, 'No perder')
  await submit()
  assert.equal(store[0].title, 'No perder')
})

test('search is accent insensitive, filters reset pagination, relation survives editing', async () => {
  store = Array.from({ length: 15 }, (_, index) => makeNote(index + 1))
  store[14] = makeNote(15, {
    title: 'Caf\u00e9',
    priority: 'urgente',
    relationType: 'producto',
    relationId: 10,
    noteDate: '2026-09-23T19:30:00.000Z'
  })
  await renderNotes()
  assert.equal(document.querySelectorAll('.note-row').length, 12)
  await click(byLabel('P\u00e1gina siguiente'))
  assert.equal(document.querySelectorAll('.note-row').length, 3)
  await type(byLabel('Buscar notas'), 'cafe')
  assert.equal(document.querySelectorAll('.note-row').length, 1)
  await click(document.querySelector('.note-relation'))
  assert.equal(openedRelation.relationId, 10)
  await click(byLabel('Abrir nota: Caf\u00e9'))
  await type(byLabel('Contenido de la nota'), 'Texto nuevo')
  await submit()
  assert.equal(store[14].relationId, 10)
  assert.equal(store[14].noteDate, '2026-09-23T19:30:00.000Z')
  await click(byLabel('Completar nota'))
  await click(findButton('Pendientes'))
  assert.equal(document.querySelectorAll('.note-row').length, 0)
  await click(findButton('Completadas'))
  assert.equal(document.querySelectorAll('.note-row').length, 1)
})

test('loading errors offer retry and do not pretend there are no notes', async () => {
  failRead = true
  await renderNotes()
  assert.ok(document.querySelector('[role="alert"]'))
  assert.equal(findButton('Nueva nota').disabled, true)
  failRead = false
  await click(findButton('Reintentar'))
  assert.equal(document.querySelector('[role="alert"]'), null)
  assert.ok(document.querySelector('.note-row'))
})

test('repeated submits while saving send a single request', async () => {
  store = []
  await renderNotes()
  await click(findButton('Nueva nota'))
  await type(byLabel('T\u00edtulo de la nota'), 'Una sola nota')
  const before = creates
  await act(async () => {
    const form = document.querySelector('form.note-editor')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.equal(creates - before, 1)
  assert.equal(store.length, 1)
})

test('application exposes six modules and shared sales/inventory KPI markup', async () => {
  await act(async () => root.render(null))
  await act(async () => root.render(React.createElement(App)))
  assert.equal(document.querySelectorAll('.bottom-nav button').length, 6)
  assert.equal(
    document.querySelectorAll('.sales-stats .inventory-stat').length,
    3
  )
  const navigate = async (label) =>
    click(
      [...document.querySelectorAll('.bottom-nav button')].find((button) =>
        button.textContent.includes(label)
      )
    )
  await navigate('Inventario')
  assert.equal(
    document.querySelectorAll('.inventory-stats .inventory-stat').length,
    3
  )
  assert.ok(
    document.querySelector('.inventory-stats').textContent.includes('RD$600.00')
  )
  await navigate('Notas')
  assert.equal(document.querySelector('#notes-heading').textContent, 'Notas')
  for (const [label, selector] of [
    ['Caja', '.cash-shell'],
    ['Deudas', '.debt-shell'],
    ['C\u00e1lculos', '.estimate-shell'],
    ['Ventas', '.sales-workspace']
  ]) {
    await navigate(label)
    assert.ok(document.querySelector(selector), `${label} remains accessible`)
  }
  assert.equal(products[0].stock, 4)
})

test('initial data loading shows a loader, then an error and a working retry without fake zero balances', async () => {
  await act(async () => root.render(null))
  const originalLoad = globalThis.__appServiceTest.getAppState
  const originalWarn = console.warn
  let rejectLoad
  globalThis.__appServiceTest.getAppState = () =>
    new Promise((_resolve, reject) => {
      rejectLoad = reject
    })
  try {
    await act(async () => root.render(React.createElement(App)))
    assert.ok(document.querySelector('.module-loader'))
    assert.equal(document.querySelector('.sales-workspace'), null)
    assert.equal(document.querySelectorAll('.bottom-nav button').length, 6)
    console.warn = () => {}
    await act(async () => rejectLoad(new Error('Connection unavailable')))
    assert.ok(document.querySelector('.module-load-error'))
    assert.equal(document.querySelector('.sales-workspace'), null)
    globalThis.__appServiceTest.getAppState = originalLoad
    await click(findButton('Reintentar'))
    assert.ok(document.querySelector('.sales-workspace'))
    assert.equal(document.querySelector('.module-loader'), null)
  } finally {
    globalThis.__appServiceTest.getAppState = originalLoad
    console.warn = originalWarn
    await act(async () => root.render(null))
  }
})
