import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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
export async function downloadSheetPdf(element, filename, { keepWhole = 'tbody tr' } = {}) {
  if (!element) return

  await withLightTheme(() => withPaperLayout(element, async () => {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
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
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', MARGIN_PT, MARGIN_PT, contentWidth, sliceHeight / pxPerPt)
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  }))
}
