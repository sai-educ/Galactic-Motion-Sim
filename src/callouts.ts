import type { PerspectiveCamera, Vector3 } from 'three'

export interface Callout {
  element: HTMLElement
  caption: HTMLElement
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** A pinned tag's box in viewport pixels, with its normalized depth: smaller values are nearer the camera. */
export interface DepthBox extends Rect {
  depth: number
}

/** `behind` tags sit under a nearer tag and dim; `front` tags cover a farther one and brighten. */
export type Layer = 'clear' | 'front' | 'behind'

type CalloutKind = 'system' | 'neighbor' | 'body' | 'arm' | 'scale' | 'sky'
// Tags the viewer can click to follow what they name.
const CLICKABLE: readonly CalloutKind[] = ['system', 'neighbor']

function intersects(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** Decides how overlapping pinned tags are drawn. Equal depths are broken by order so one tag stays bright. */
export function layerByDepth(boxes: readonly DepthBox[]): Layer[] {
  const nearer = (a: number, b: number) =>
    boxes[a].depth < boxes[b].depth || (boxes[a].depth === boxes[b].depth && a < b)
  return boxes.map((box, index) => {
    let front = false
    for (let other = 0; other < boxes.length; other++) {
      if (other === index || !intersects(box, boxes[other])) continue
      if (nearer(other, index)) return 'behind'
      front = true
    }
    return front ? 'front' : 'clear'
  })
}

export function createCallout(text: string, kind: CalloutKind, color?: string): Callout {
  const element = document.createElement(CLICKABLE.includes(kind) ? 'button' : 'div')
  element.className = `annotation ${kind}-callout`
  element.hidden = true
  if (element instanceof HTMLButtonElement) element.type = 'button'
  else if (kind !== 'arm') element.setAttribute('aria-hidden', 'true')
  if (color) element.style.setProperty('--system-color', color)
  const locator = document.createElement('span')
  locator.className = 'locator'
  const leader = document.createElement('span')
  leader.className = 'callout-leader'
  const caption = document.createElement('span')
  caption.className = 'annotation-name'
  caption.textContent = text
  element.append(locator, leader, caption)
  return { element, caption }
}

const LANES = [0, -23, 23, -46, 46, -69, 69, -92, 92]
const CLEARANCES = [14, 43, 76]
const TEXT_HEIGHT = 19
const CHARACTER_WIDTH = 6.6
const EDGE_MARGIN = 9
// A pinned tag keeps this offset from its body: a short gap to one side, slightly above.
const PIN_GAP = 14
const PIN_RISE = 12

export function createCalloutLayout(camera: PerspectiveCamera, capacity: number) {
  const placed = new Float32Array(capacity * 4)
  let count = 0
  let width = 0
  let height = 0
  let blocked: readonly Rect[] = []
  // Pinned tags remember their side, so they only switch when the screen edge forces it.
  const sides = new WeakMap<Callout, number>()
  let pins: { tag: Callout, box: DepthBox }[] = []

  /** Starts a frame. Tags avoid the given rectangles, and points underneath them are not marked. */
  function begin(viewportWidth: number, viewportHeight: number, obstacles: readonly Rect[] = []) {
    width = viewportWidth
    height = viewportHeight
    blocked = obstacles
    count = 0
    pins = []
  }

  function overlaps(left: number, top: number, right: number, bottom: number) {
    for (let i = 0; i < count; i += 4) {
      if (left < placed[i + 2] + 4 && right > placed[i] - 4 && top < placed[i + 3] + 3 && bottom > placed[i + 1] - 3) return true
    }
    for (const rect of blocked) {
      if (left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top) return true
    }
    return false
  }

  function covered(x: number, y: number) {
    return blocked.some(rect => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom)
  }

  function reserve(left: number, top: number, right: number, bottom: number) {
    if (count + 4 > placed.length) return
    placed[count++] = left
    placed[count++] = top
    placed[count++] = right
    placed[count++] = bottom
  }

  /** Projects a world position to viewport pixels, or returns false when it cannot be marked. */
  function locate(position: Vector3) {
    position.project(camera)
    const x = (position.x + 1) * width * 0.5
    const y = (1 - position.y) * height * 0.5
    const depth = position.z
    if (depth <= -1 || depth >= 1 || x < 6 || x > width - 6 || y < 6 || y > height - 6 || covered(x, y)) return false
    position.set(x, y, depth)
    return true
  }

  function textWidth(caption: HTMLElement) {
    return (caption.textContent?.length ?? 0) * CHARACTER_WIDTH + 15
  }

  function draw(element: HTMLElement, x: number, y: number, left: number, top: number, side: number, span: number) {
    const dx = side > 0 ? left - x : left + span - x
    const dy = top + TEXT_HEIGHT / 2 - y
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    element.style.setProperty('--tag-x', `${(left - x).toFixed(1)}px`)
    element.style.setProperty('--tag-y', `${(top - y).toFixed(1)}px`)
    element.style.setProperty('--leader-length', `${Math.hypot(dx, dy).toFixed(1)}px`)
    element.style.setProperty('--leader-angle', `${Math.atan2(dy, dx).toFixed(3)}rad`)
    element.hidden = false
  }

  /**
   * Keeps a tag at a fixed offset from its point instead of searching for free space, so it never jumps as
   * things move. Overlapping pinned tags are drawn by depth in `finish`.
   */
  function pin(tag: Callout, position: Vector3) {
    const { element, caption } = tag
    if (!locate(position)) {
      element.hidden = true
      return
    }
    const { x, y, z } = position
    const span = textWidth(caption)
    const fits = (side: number) => side > 0
      ? x + PIN_GAP + span <= width - EDGE_MARGIN
      : x - PIN_GAP - span >= EDGE_MARGIN
    let side = sides.get(tag) ?? (x >= width / 2 ? 1 : -1)
    if (!fits(side) && fits(-side)) side = -side
    sides.set(tag, side)
    const left = side > 0 ? x + PIN_GAP : x - PIN_GAP - span
    const top = Math.min(height - EDGE_MARGIN - TEXT_HEIGHT, Math.max(EDGE_MARGIN, y - PIN_RISE - TEXT_HEIGHT / 2))
    draw(element, x, y, left, top, side, span)
    pins.push({ tag, box: { left, top, right: left + span, bottom: top + TEXT_HEIGHT, depth: z } })
  }

  /** Ends a frame: nearer pinned tags draw on top and brighten, and the tags they cover dim. */
  function finish() {
    const layers = layerByDepth(pins.map(entry => entry.box))
    const byDistance = pins.map((_, index) => index).sort((a, b) => pins[b].box.depth - pins[a].box.depth)
    byDistance.forEach((index, rank) => {
      const { element } = pins[index].tag
      element.style.zIndex = String(rank + 1)
      element.dataset.layer = layers[index]
    })
  }

  function place(tag: Callout, position: Vector3) {
    const { element, caption } = tag
    if (!locate(position)) {
      element.hidden = true
      return
    }
    const { x, y } = position
    const span = textWidth(caption)
    const prefer = x >= width / 2 ? 1 : -1
    const offset = -TEXT_HEIGHT / 2
    if (trySide(prefer) || trySide(-prefer)) return
    element.hidden = true

    function trySide(side: number) {
      for (const clearance of CLEARANCES) {
        const left = side > 0 ? x + clearance : x - clearance - span
        const right = left + span
        if (left < EDGE_MARGIN || right > width - EDGE_MARGIN) continue
        for (const lane of LANES) {
          const top = y + offset + lane
          if (top < EDGE_MARGIN || top + TEXT_HEIGHT > height - EDGE_MARGIN) continue
          if (overlaps(left, top, right, top + TEXT_HEIGHT)) continue
          reserve(left, top, right, top + TEXT_HEIGHT)
          draw(element, x, y, left, top, side, span)
          return true
        }
      }
      return false
    }
  }

  return { begin, place, pin, finish, locate, reserve }
}
