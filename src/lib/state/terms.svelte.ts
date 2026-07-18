import { isNative } from '../api/platform'

/**
 * Whether this device has agreed to the terms, and to which version.
 *
 * App Review expects a user-generated-content app to carry an EULA with a
 * zero-tolerance clause AND evidence every user agreed to it — the agreement
 * step is the part that matters, not the prose. This records it.
 *
 * Scoped to the NATIVE build on purpose. On mothtrap.blue an agreement wall in
 * front of someone's own research instrument would be pure friction for no
 * benefit: the terms are published either way, and the web app has never been
 * the thing under review. See isNative().
 *
 * Versioned, so materially changing the terms re-asks rather than silently
 * relying on consent to a document that no longer exists. Bump in step with the
 * version line in public/terms.html.
 */

const KEY = 'mothtrap.termsAccepted'

export const TERMS_VERSION = 1

function read(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0 // private mode — ask again rather than assume agreement
  }
}

class Terms {
  acceptedVersion = $state<number>(read())

  /** Does the app need to show the gate before anything else? */
  get required(): boolean {
    return isNative() && this.acceptedVersion < TERMS_VERSION
  }

  get accepted(): boolean {
    return this.acceptedVersion >= TERMS_VERSION
  }

  accept() {
    this.acceptedVersion = TERMS_VERSION
    try {
      localStorage.setItem(KEY, String(TERMS_VERSION))
    } catch {
      /* private mode — they'll be asked again next launch */
    }
  }

  /** Withdraw agreement (from Settings). Puts the gate back on next launch. */
  reset() {
    this.acceptedVersion = 0
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* nothing to remove */
    }
  }
}

export const terms = new Terms()
