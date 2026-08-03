import { useEffect, useRef, useState } from 'react'

// A horizontally scrolling area whose scrollbar stays within reach. Content taller than
// the viewport — an A4 sheet, a long table — pushes the normal bottom scrollbar off the
// bottom of the screen, so the real one is hidden and a proxy bar rides the bottom of the
// viewport for as long as the area is in view. Dragging either scrolls both.
//
// The proxy has to sit OUTSIDE the scroller for `sticky` to resolve against the page's
// scrollport rather than the scroller's own, so it is a sibling — which means whatever
// wraps this pair must not itself be an overflow container.
export default function StickyHScroll({ className = '', children }) {
  const scrollerRef = useRef(null)
  const proxyRef = useRef(null)
  // Measured rather than read on demand: the proxy's spacer is what gives its scrollbar a
  // range, so the content width has to survive into the render that mounts the proxy.
  const [size, setSize] = useState({ content: 0, visible: 0 })
  const overflowing = size.content > size.visible + 1

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const measure = () => setSize({ content: scroller.scrollWidth, visible: scroller.clientWidth })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    return () => observer.disconnect()
  }, [children])

  // Either bar may be the one dragged. Writing scrollLeft fires the other's scroll event
  // in turn, so the write is skipped once the two already agree and the echo stops there.
  function mirror(from, to) {
    if (!from || !to) return
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) to.scrollLeft = from.scrollLeft
  }

  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={() => mirror(scrollerRef.current, proxyRef.current)}
        className={`overflow-x-auto no-scrollbar ${className}`}
      >
        {children}
      </div>
      {overflowing && (
        // `-mt-2` gives back the height the bar would otherwise add to the flow, so it
        // floats over the last sliver of the content instead of banding the foot of the
        // area with an empty strip. No background either — only the scrollbar shows.
        <div
          ref={proxyRef}
          onScroll={() => mirror(proxyRef.current, scrollerRef.current)}
          aria-hidden="true"
          className="sticky bottom-0 z-20 -mt-2 h-2 overflow-x-auto overflow-y-hidden"
        >
          <div className="h-px" style={{ width: size.content }} />
        </div>
      )}
    </>
  )
}
