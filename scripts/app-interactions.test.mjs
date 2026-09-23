import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installAppInteractions } from '../src/lib/appInteractions.js'

function dispatch(target, name, properties = {}) {
  const event = new Event(name, { cancelable: true })
  Object.assign(event, properties)
  target.dispatchEvent(event)
  return event.defaultPrevented
}

test('pinch and Safari zoom are blocked, single-finger scrolling and clicks remain available', () => {
  const target = new EventTarget()
  const dispose = installAppInteractions(target)
  assert.equal(dispatch(target, 'touchstart', { touches: [{}, {}] }), true)
  assert.equal(dispatch(target, 'touchmove', { touches: [{}, {}] }), true)
  assert.equal(dispatch(target, 'gesturestart'), true)
  assert.equal(dispatch(target, 'gesturechange'), true)
  assert.equal(dispatch(target, 'touchstart', { touches: [{}] }), false)
  assert.equal(dispatch(target, 'touchmove', { touches: [{}] }), false)
  assert.equal(dispatch(target, 'click'), false)
  dispose()
})

test('zoom shortcuts are blocked while typing, copying and normal wheel scrolling are preserved', () => {
  const target = new EventTarget()
  const dispose = installAppInteractions(target)
  assert.equal(dispatch(target, 'wheel', { ctrlKey: true }), true)
  assert.equal(dispatch(target, 'wheel', { ctrlKey: false }), false)
  for (const key of ['+', '=', '-', '_', '0']) {
    assert.equal(dispatch(target, 'keydown', { key, ctrlKey: true }), true)
    assert.equal(dispatch(target, 'keydown', { key, metaKey: true }), true)
    assert.equal(dispatch(target, 'keydown', { key }), false)
  }
  assert.equal(dispatch(target, 'keydown', { key: 'c', ctrlKey: true }), false)
  assert.equal(dispatch(target, 'keydown', { key: 'Tab' }), false)
  dispose()
})

test('hot reload cleanup removes all gesture listeners', () => {
  const target = new EventTarget()
  const dispose = installAppInteractions(target)
  dispose()
  assert.equal(dispatch(target, 'gesturestart'), false)
  assert.equal(dispatch(target, 'touchmove', { touches: [{}, {}] }), false)
  assert.equal(dispatch(target, 'wheel', { ctrlKey: true }), false)
  assert.equal(dispatch(target, 'keydown', { key: '+', ctrlKey: true }), false)
})
