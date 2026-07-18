/**
 * Is this the native (Tauri) build, rather than the web app?
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` into the page it hosts; v1 used
 * `__TAURI__`. Both are checked so the answer doesn't silently flip to false on
 * a version change — a false negative here would drop the terms gate.
 *
 * Used to scope things App Review expects from a shipped iOS app but which
 * would be pure friction on mothtrap.blue — putting an agreement wall in front
 * of someone's own research instrument, in particular.
 */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return w.__TAURI_INTERNALS__ !== undefined || w.__TAURI__ !== undefined
}
