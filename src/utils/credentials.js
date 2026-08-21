// ── Local sign-in credentials ────────────────────────────────────────────────
// This app has no server, so a password can only ever be checked in the browser against
// something the browser itself stores. That has a hard limit and it must be stated plainly:
// anyone who can open developer tools on this machine can read the stored record, replace it,
// or set a session flag directly. This is NOT a security boundary against someone with access
// to the browser, and it is not a substitute for server-side authorisation.
//
// What it does do, and what it is here for: it stops the app opening straight into the loan
// book as Admin for anyone who loads the page; it ties each session to a named account, so the
// role that governs permissions is the one that account holds rather than a dropdown anybody
// can change; and it means a shared branch terminal asks who you are.
//
// The password itself is never stored. PBKDF2-SHA-256 over a per-user random salt is what is
// kept — the correct primitive rather than a bare hash, so a stolen store cannot be reversed
// with a rainbow table, and 210,000 iterations makes guessing expensive per attempt. Web Crypto
// provides all of it, so there is no dependency to add.

const ITERATIONS = 210000
const KEY_BITS = 256

// Web Crypto's subtle API exists only in a SECURE CONTEXT: https, or http on localhost. Opened
// straight off disk as file://, or served over http:// from a LAN address, `crypto.subtle` is
// undefined and every hash below would throw. That is worth detecting by name rather than
// letting it surface as a mystery failure at the sign-in button, because the fix is a deployment
// change, not a password problem.
export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle

export class InsecureContextError extends Error {
  constructor() {
    super('Sign-in needs a secure context: open the app over https:// or http://localhost.')
    this.name = 'InsecureContextError'
  }
}

const toHex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

export function makeSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

const hexToBytes = hex => new Uint8Array((hex.match(/.{1,2}/g) || []).map(h => parseInt(h, 16)))

export async function hashPassword(password, saltHex) {
  if (!cryptoAvailable()) throw new InsecureContextError()
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return toHex(new Uint8Array(bits))
}

// Compared byte by byte in constant time. The timing leak this closes is not realistically
// exploitable in a local browser check, but writing the comparison the wrong way here is how
// the habit gets carried into code where it does matter.
function sameDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false
  return sameDigest(await hashPassword(password, user.passwordSalt), user.passwordHash)
}

// An account with no credential on file has to set one before it can sign in. Deliberately not
// solved by shipping a default password: a known starting credential that nobody changes is the
// most common way a system like this gets opened, and there is no admin here to enforce a reset.
export const needsPassword = user => !user?.passwordHash || !user?.passwordSalt

// Refused rather than merely discouraged. The rule is stated to the operator as it is applied,
// so a rejected password says which part failed.
export function passwordProblem(password, confirm) {
  if (password.length < 8) return 'Use at least 8 characters'
  if (!/[a-z]/i.test(password)) return 'Include at least one letter'
  if (!/\d/.test(password)) return 'Include at least one number'
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match'
  return ''
}
