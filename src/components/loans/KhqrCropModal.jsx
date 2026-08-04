import { useEffect, useRef, useState } from 'react'
import { X, Crop, RotateCcw } from 'lucide-react'

// Crops an uploaded KHQR before it goes onto the schedule. A photo or screenshot of a bank's
// KHQR almost always arrives with the app's chrome around it, and pasting that whole frame
// into the letterhead slot leaves the code itself too small to scan. The crop opens on the
// largest centred square — a sensible default for a bare code — and width and height are
// adjusted from there, so a whole KHQR card (banner, payee, code stacked in a portrait
// rectangle) can be framed as well as the code on its own.
//
// Width and height move independently, so the output canvas takes the crop's own aspect ratio
// rather than being squeezed into a square. Forcing a rectangular crop square would stretch
// the code, and a stretched QR does not scan. The longest side lands on OUTPUT_PX.
const OUTPUT_PX = 512
const MIN_CROP_PX = 40

export default function KhqrCropModal({ file, onCancel, onApply }) {
  const [src, setSrc] = useState('')
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  // Crop is held in natural image pixels so the output is cut from the full-resolution
  // source rather than from whatever size it happens to be displayed at.
  const [crop, setCrop] = useState(null)
  const [error, setError] = useState('')
  const imgRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (!file) return
    const reader = new FileReader()
    reader.onerror = () => setError('That image could not be read')
    reader.onload = () => setSrc(String(reader.result))
    reader.readAsDataURL(file)
  }, [file])

  // Escape closes the cropper only. Stopped here so it does not also reach App.jsx's
  // document-level handler and tear down the loan preview behind it.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  function handleLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.target
    setNatural({ w, h })
    const size = Math.min(w, h)
    setCrop({ x: Math.round((w - size) / 2), y: Math.round((h - size) / 2), w: size, h: size })
  }

  // Displayed size differs from natural size, so pointer deltas are converted before they
  // move the crop — otherwise dragging would travel at the wrong speed on any scaled image.
  function scale() {
    const el = imgRef.current
    if (!el || !natural.w) return 1
    return natural.w / el.clientWidth
  }

  function clamp(next) {
    const w = Math.max(MIN_CROP_PX, Math.min(next.w, natural.w))
    const h = Math.max(MIN_CROP_PX, Math.min(next.h, natural.h))
    return {
      w,
      h,
      x: Math.max(0, Math.min(next.x, natural.w - w)),
      y: Math.max(0, Math.min(next.y, natural.h - h)),
    }
  }

  function startDrag(e) {
    e.preventDefault()
    const k = scale()
    dragRef.current = { px: e.clientX, py: e.clientY, ox: crop.x, oy: crop.y, k }
    const move = ev => {
      const d = dragRef.current
      if (!d) return
      setCrop(clamp({
        w: crop.w,
        h: crop.h,
        x: Math.round(d.ox + (ev.clientX - d.px) * d.k),
        y: Math.round(d.oy + (ev.clientY - d.py) * d.k),
      }))
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Each edge grows and shrinks about the box's centre, so what is already framed stays
  // framed while it is sized rather than sliding out of the top-left corner.
  function resize(axis, value) {
    const centreX = crop.x + crop.w / 2
    const centreY = crop.y + crop.h / 2
    const w = axis === 'w' ? value : crop.w
    const h = axis === 'h' ? value : crop.h
    setCrop(clamp({ w, h, x: Math.round(centreX - w / 2), y: Math.round(centreY - h / 2) }))
  }

  function reset() {
    const size = Math.min(natural.w, natural.h)
    setCrop({ x: Math.round((natural.w - size) / 2), y: Math.round((natural.h - size) / 2), w: size, h: size })
  }

  function apply() {
    const el = imgRef.current
    if (!el || !crop) return
    // The output keeps the crop's own proportions — the longest side lands on OUTPUT_PX and
    // the other follows. Drawing a rectangular crop into a square canvas would stretch it,
    // and a stretched QR stops scanning.
    const out = OUTPUT_PX / Math.max(crop.w, crop.h)
    const width = Math.max(1, Math.round(crop.w * out))
    const height = Math.max(1, Math.round(crop.h * out))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // White underneath: a transparent PNG would lose the quiet zone against the sheet, and
    // a scanner needs that margin to find the code.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(el, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height)
    onApply(canvas.toDataURL('image/png'))
  }

  // Crop rectangle in display pixels, for the overlay.
  const k = scale() || 1
  const box = crop ? { left: crop.x / k, top: crop.y / k, width: crop.w / k, height: crop.h / k } : null

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={onCancel}>
      {/* Taller and wider than a plain dialog on purpose: the crop box is dragged by hand, and
          a cramped preview makes framing a code fiddly and inaccurate. The body scrolls so the
          controls and footer stay reachable on a short window. */}
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Crop KHQR</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Frame just the code — drag to move, or resize below.
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : !src ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">Loading image…</p>
          ) : (
            <>
              <div className="relative select-none mx-auto w-fit bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                <img
                  ref={imgRef}
                  src={src}
                  alt="Uploaded KHQR"
                  onLoad={handleLoad}
                  draggable={false}
                  className="block max-h-[64vh] w-auto"
                />
                {box && (
                  // The outward box-shadow does the dimming, so everything outside the crop
                  // darkens and what will actually be kept reads at a glance — no separate
                  // overlay, which would darken the kept area a second time through it.
                  <div
                    onPointerDown={startDrag}
                    className="absolute cursor-move border-2 border-white touch-none"
                    style={{
                      left: `${box.left}px`,
                      top: `${box.top}px`,
                      width: `${box.width}px`,
                      height: `${box.height}px`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                    }}
                  />
                )}
              </div>

              {crop && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label htmlFor="khqr-crop-w" className="w-12 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex-shrink-0">
                      Width
                    </label>
                    <input
                      id="khqr-crop-w"
                      type="range"
                      min={MIN_CROP_PX}
                      max={natural.w}
                      value={crop.w}
                      onChange={e => resize('w', Number(e.target.value))}
                      className="flex-1 accent-brand-600"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label htmlFor="khqr-crop-h" className="w-12 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex-shrink-0">
                      Height
                    </label>
                    <input
                      id="khqr-crop-h"
                      type="range"
                      min={MIN_CROP_PX}
                      max={natural.h}
                      value={crop.h}
                      onChange={e => resize('h', Number(e.target.value))}
                      className="flex-1 accent-brand-600"
                    />
                    <button
                      onClick={reset}
                      title="Reset to the largest centred square"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!crop}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Crop className="w-3.5 h-3.5" />
            Use this crop
          </button>
        </div>
      </div>
    </div>
  )
}
