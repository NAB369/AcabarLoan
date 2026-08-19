import { useCallback, useEffect, useRef } from 'react'

// ── Keyboard access for a hand-built modal ───────────────────────────────────
// The Radix-based dialogs (shadcn's Dialog / AlertDialog) already trap focus, label themselves
// and restore focus on close. The modals written by hand here — the wizards, the previews, the
// provider sign-ins, the accounting forms — did none of it: Tab walked straight out of the
// dialog into the page behind, which is still there, still focusable, and now unreachable by
// eye. A keyboard user could tab into a form they cannot see and edit it.
//
// Returns props to spread on the dialog's own panel (not the backdrop):
//
//   const modal = useModalA11y({ label: 'New Loan Application', onClose })
//   <div className="backdrop…" onClick={onClose}>
//     <div {...modal} className="panel…" onClick={e => e.stopPropagation()}>
//
// Escape is handled here too when `onClose` is given, so a modal adopting this can drop its own
// key listener. Pass `escape: false` where the component already owns Escape for more than one
// layer (a dialog stacked over a dialog needs to close the top one first).

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function useModalA11y({ label, onClose, escape = true, autoFocus = true } = {}) {
  const panelRef = useRef(null)
  // Whatever had focus when the modal opened — a row, a button, a menu item. Focus goes back
  // there on close, so dismissing a dialog returns the user to where they were rather than to
  // the top of the document.
  const returnTo = useRef(null)

  const focusablesIn = useCallback(node => (
    node ? Array.from(node.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement) : []
  ), [])

  useEffect(() => {
    returnTo.current = document.activeElement
    const panel = panelRef.current
    if (autoFocus && panel) {
      // The first control, or the panel itself when there is none — a dialog that opens with
      // focus still on the page behind it has not really opened for a keyboard user.
      const first = focusablesIn(panel)[0]
      ;(first || panel).focus({ preventScroll: true })
    }
    return () => {
      const back = returnTo.current
      if (back && typeof back.focus === 'function' && document.contains(back)) {
        back.focus({ preventScroll: true })
      }
    }
  }, [autoFocus, focusablesIn])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && escape && onClose) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = focusablesIn(panel)
      if (!items.length) {
        // Nothing to tab between, so Tab must not leave: hold it on the panel.
        e.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      // The wrap-around is the trap: past the last control Tab returns to the first, and
      // Shift+Tab off the first goes to the last, so focus cycles inside the dialog.
      if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [escape, onClose, focusablesIn])

  return {
    ref: panelRef,
    role: 'dialog',
    'aria-modal': true,
    'aria-label': label,
    // Focusable as a fallback target, but never a Tab stop of its own.
    tabIndex: -1,
  }
}
