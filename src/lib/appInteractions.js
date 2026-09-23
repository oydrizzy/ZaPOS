export function installAppInteractions(target = document) {
  const prevent = (event) => {
    if (event.cancelable) event.preventDefault()
  }
  const preventPinch = (event) => {
    if (event.touches?.length > 1) prevent(event)
  }
  const preventWheelZoom = (event) => {
    if (event.ctrlKey || event.metaKey) prevent(event)
  }
  const preventKeyZoom = (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      ['+', '=', '-', '_', '0'].includes(event.key)
    )
      prevent(event)
  }
  // CSS handles normal touch gestures; these cover Safari and trackpad zoom.
  const listeners = [
    ['gesturestart', prevent],
    ['gesturechange', prevent],
    ['touchstart', preventPinch],
    ['touchmove', preventPinch],
    ['wheel', preventWheelZoom],
    ['keydown', preventKeyZoom]
  ]
  const options = { passive: false, capture: true }
  listeners.forEach(([name, listener]) =>
    target.addEventListener(name, listener, options)
  )
  return () =>
    listeners.forEach(([name, listener]) =>
      target.removeEventListener(name, listener, options)
    )
}
