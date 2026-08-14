import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { openPdfBytes } from './pdfText'

// The A4 sheets are laid out for 210mm at 96dpi. On a narrow screen the sheet shrinks and
// its table scrolls sideways, so the capture is taken at the full paper width instead of
// whatever the viewport happens to be showing.
const SHEET_WIDTH_PX = 794
// Margin on every edge of every page. The sides used to be left to the sheet's own inner
// padding, which meant the image was drawn at the full paper width: content ran to within a
// few points of the paper edge horizontally while the top and bottom sat 24pt in, so nothing
// lined up and the sheet read as though it had been cropped. The image is now inset by this on
// all four sides and scaled to the column between them.
const MARGIN_PT = 24

// How many device pixels html2canvas draws per CSS pixel of the sheet. The sheet is 794px wide
// and lands in a 547pt column, so scale 2 rasterised it at roughly 209dpi — fine for a figure,
// thin for the 9pt text the profile is almost entirely made of. 4 puts it near 417dpi, above
// the 300dpi a printer resolves, so the glyph edges are what limits legibility rather than the
// raster. It costs about 40% more file (≈2.7MB → ≈3.9MB on a four-page profile); going higher
// buys nothing visible at print size and grows memory on a long profile.
//
// This is the ceiling because the sheet has to be a raster at all: jsPDF's own text renderer
// carries no Khmer font and does no OpenType shaping, so exporting the profile as vector text
// turns every Khmer name and address into garbled Latin glyphs — measured, not assumed. The
// document is bilingual, so a sharp-but-wrong export is not a trade worth making.
const SHEET_SCALE = 4

// A sheet is a paper document; dark mode restyles it (the theme remaps bg-white and the
// slate text colours), which has no business in an exported PDF, so the theme steps aside
// while the browser renders it.
export async function withLightTheme(run) {
  const root = document.documentElement
  const wasDark = root.classList.contains('dark')
  if (wasDark) root.classList.remove('dark')
  try {
    return await run()
  } finally {
    if (wasDark) root.classList.add('dark')
  }
}

// Lays the sheet out at paper width for the duration of the capture, and opens up any
// scroll container inside it — html2canvas rasterises what is visible, so a table clipped
// by `overflow-x-auto` would otherwise lose its right-hand columns.
async function withPaperLayout(element, run) {
  const restore = []
  const set = (el, prop, value) => {
    restore.push([el, prop, el.style[prop]])
    el.style[prop] = value
  }

  set(element, 'width', `${SHEET_WIDTH_PX}px`)
  set(element, 'maxWidth', 'none')
  // On screen the sheet sits in a rounded, bordered card. On paper it is the page itself,
  // so the card chrome comes off — otherwise every page carries a stray boxed edge.
  set(element, 'border', 'none')
  set(element, 'borderRadius', '0')
  set(element, 'boxShadow', 'none')
  for (const el of element.querySelectorAll('*')) {
    const { overflowX, overflowY } = getComputedStyle(el)
    if ([overflowX, overflowY].some(v => v === 'auto' || v === 'scroll')) set(el, 'overflow', 'visible')
  }

  try {
    return await run()
  } finally {
    for (const [el, prop, value] of restore) el.style[prop] = value
  }
}

// Where to cut the rasterised sheet into pages. Slicing blindly every page-height lands
// the boundary wherever it falls — through the middle of an installment row as often as
// not — so the elements named by `keepWhole` are measured off the live DOM and a cut that
// would run through one is pulled back to that element's top.
// Returns [start, end] pairs in canvas pixels.
function pageCuts(element, canvas, pageHeightPx, keepWhole) {
  const sheet = element.getBoundingClientRect()
  const ratio = canvas.height / sheet.height
  const units = Array.from(element.querySelectorAll(keepWhole)).map(el => {
    const r = el.getBoundingClientRect()
    return { top: (r.top - sheet.top) * ratio, bottom: (r.bottom - sheet.top) * ratio }
  })

  const cuts = []
  for (let offset = 0; offset < canvas.height;) {
    const limit = offset + pageHeightPx
    if (limit >= canvas.height) { cuts.push([offset, canvas.height]); break }
    // Of every unit the cut would run through, the highest one decides the page's end.
    const straddled = units.filter(u => u.top > offset && u.top < limit && u.bottom > limit)
    const pulled = straddled.length ? Math.floor(Math.min(...straddled.map(u => u.top))) : limit
    // A unit taller than a page can't be rescued, and pulling back to one that starts near
    // the top of the page would leave a near-empty sheet — cut at the page edge.
    const cut = pulled > offset + pageHeightPx * 0.15 ? pulled : limit
    cuts.push([offset, cut])
    offset = cut
  }
  return cuts
}

// Saves an on-screen A4 sheet as a paged PDF. jsPDF's own text rendering carries no Khmer
// font — every label would come out as garbled Latin glyphs — so the browser rasterises
// the sheet and the image is cut into pages.
// ── Uploaded documents, merged into the sheet they belong to ────────────────────────────────
// A profile that lists its attachments by filename is an index, not a file: whoever receives it
// still has to be sent every document separately. These append the documents themselves after
// the data pages so one saved PDF is the whole record.
//
// Both kinds are drawn as images. A photographed ID already is one; a PDF is rasterised a page
// at a time through pdfjs — which the app already carries for reading uploaded statements — so
// no PDF-merging dependency is needed. The cost is that appended PDF pages stop being
// selectable text, which for a scan or a title deed they were not to begin with.

const isImageDoc = doc => (doc?.mimeType || '').startsWith('image/')
  || /\.(jpe?g|png|gif|webp|bmp)$/i.test(doc?.name || '')
const isPdfDoc = doc => (doc?.mimeType || '') === 'application/pdf' || /\.pdf$/i.test(doc?.name || '')

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

// Names the page before the document on it, so a printed bundle stays readable once the pages
// are separated from the profile they came out of. Returns the y the document starts at.
function drawCaption(pdf, doc, pageWidth) {
  const heading = [doc.label, doc.docType].filter(Boolean).join(' · ')
  pdf.setFontSize(9)
  pdf.setTextColor(100)
  if (heading) pdf.text(heading, MARGIN_PT, MARGIN_PT + 8, { maxWidth: pageWidth - MARGIN_PT * 2 })
  pdf.setFontSize(11)
  pdf.setTextColor(30)
  pdf.text(doc.name || 'Attachment', MARGIN_PT, MARGIN_PT + (heading ? 24 : 12),
    { maxWidth: pageWidth - MARGIN_PT * 2 })
  pdf.setTextColor(0)
  return MARGIN_PT + (heading ? 34 : 22)
}

// Fitted inside the space left under the caption, never enlarged past its own size — blowing a
// small thumbnail up to fill A4 makes it blurrier, not more readable.
function drawFitted(pdf, imgData, format, naturalW, naturalH, top, pageWidth, pageHeight) {
  const maxW = pageWidth - MARGIN_PT * 2
  const maxH = pageHeight - top - MARGIN_PT
  const scale = Math.min(maxW / naturalW, maxH / naturalH)
  const w = naturalW * scale
  const h = naturalH * scale
  pdf.addImage(imgData, format, MARGIN_PT + (maxW - w) / 2, top, w, h)
}

// 2× the PDF's own point grid, i.e. ~144dpi — enough to read a scanned title deed without
// making a ten-page attachment enormous.
const PDF_PAGE_SCALE = 2

async function appendAttachments(pdf, attachments, pageWidth, pageHeight) {
  for (const doc of attachments) {
    if (!doc?.dataUrl) continue
    try {
      if (isImageDoc(doc)) {
        const img = await loadImage(doc.dataUrl)
        pdf.addPage()
        const top = drawCaption(pdf, doc, pageWidth)
        const format = /^data:image\/png/i.test(doc.dataUrl) ? 'PNG' : 'JPEG'
        drawFitted(pdf, doc.dataUrl, format, img.naturalWidth, img.naturalHeight, top, pageWidth, pageHeight)
      } else if (isPdfDoc(doc)) {
        const source = await openPdfBytes(dataUrlBytes(doc.dataUrl))
        for (let n = 1; n <= source.numPages; n++) {
          const page = await source.getPage(n)
          const viewport = page.getViewport({ scale: PDF_PAGE_SCALE })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: ctx, viewport }).promise
          pdf.addPage()
          const label = source.numPages > 1 ? { ...doc, name: `${doc.name} — page ${n} of ${source.numPages}` } : doc
          const top = drawCaption(pdf, label, pageWidth)
          drawFitted(pdf, canvas.toDataURL('image/jpeg', 0.92), 'JPEG',
            canvas.width, canvas.height, top, pageWidth, pageHeight)
        }
      } else {
        // Neither an image nor a PDF — say so on its own page rather than dropping it, so the
        // bundle never quietly omits a document that was attached to the record.
        pdf.addPage()
        const top = drawCaption(pdf, doc, pageWidth)
        pdf.setFontSize(10)
        pdf.text('This file type cannot be printed into the profile. It is attached to the loan record.',
          MARGIN_PT, top + 12, { maxWidth: pageWidth - MARGIN_PT * 2 })
      }
    } catch {
      // One unreadable attachment must not cost the operator the whole export.
      pdf.addPage()
      const top = drawCaption(pdf, doc, pageWidth)
      pdf.setFontSize(10)
      pdf.text('This document could not be read and has not been printed.',
        MARGIN_PT, top + 12, { maxWidth: pageWidth - MARGIN_PT * 2 })
    }
  }
}

export async function downloadSheetPdf(element, filename, { keepWhole = 'tbody tr', attachments = [] } = {}) {
  if (!element) return

  await withLightTheme(() => withPaperLayout(element, async () => {
    const canvas = await html2canvas(element, { scale: SHEET_SCALE, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF('p', 'pt', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    // The sheet is scaled to the column between the side margins, not to the whole page, so
    // the conversion every page cut is measured in has to be taken against that column too —
    // deriving it from the full width would make each slice slightly taller than the space it
    // is drawn into, and the overflow would creep down the page as the document went on.
    const contentWidth = pageWidth - MARGIN_PT * 2
    const pxPerPt = canvas.width / contentWidth
    const pageHeightPx = Math.floor((pageHeight - MARGIN_PT * 2) * pxPerPt)

    for (const [offset, end] of pageCuts(element, canvas, pageHeightPx, keepWhole)) {
      const sliceHeight = end - offset
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceHeight
      const ctx = slice.getContext('2d')
      // A page cut short to spare a row leaves the rest of the sheet white rather than
      // transparent, which JPEG would otherwise flatten to black.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, sliceHeight)
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      if (offset > 0) pdf.addPage()
      // Quality raised from 0.95: at this resolution the remaining JPEG artefacts are what is
      // left to see on a hairline rule or the stem of a 9pt glyph. Lossless PNG was tried here
      // and is sharper again, but html2canvas draws anti-aliased text as thousands of distinct
      // colours, so a four-page profile came out at 75MB — unusable to email or file. This is
      // the point where the type is limited by its own edges rather than by the codec.
      pdf.addImage(slice.toDataURL('image/jpeg', 0.98), 'JPEG', MARGIN_PT, MARGIN_PT, contentWidth, sliceHeight / pxPerPt)
    }

    // The documents themselves, after the data pages, so one file is the whole record.
    await appendAttachments(pdf, attachments, pageWidth, pageHeight)

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  }))
}
