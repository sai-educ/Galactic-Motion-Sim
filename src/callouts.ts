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

type CalloutKind = 'system' | 'body' | 'time' | 'arm' | 'scale' | 'sky'
const INTERACTIVE: CalloutKind[] = ['system', 'sky']

export function createCallout(text: string, kind: CalloutKind, color?: string): Callout {
  const interactive = INTERACTIVE.includes(kind)
  const element = document.createElement(interactive ? 'button' : 'div')
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

export function createCalloutLayout(camera: PerspectiveCamera, capacity: number) {
  const placed = new Float32Array(capacity * 4)
  let count = 0
  let width = 0
  let height = 0
  let blocked: readonly Rect[] = []

  /** Starts a frame. Tags avoid the given rectangles, and points underneath them are not marked. */
  function begin(viewportWidth: number, viewportHeight: number, obstacles: readonly Rect[] = []) {
    width = viewportWidth
    height = viewportHeight
    blocked = obstacles
    count = 0
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
    if (position.z <= -1 || position.z >= 1 || x < 6 || x > width - 6 || y < 6 || y > height - 6 || covered(x, y)) return false
    position.set(x, y, 0)
    return true
  }

  function place(tag: Callout, position: Vector3, below = false) {
    const { element, caption } = tag
    if (!locate(position)) {
      element.hidden = true
      return
    }
    const { x, y } = position
    const textWidth = (caption.textContent?.length ?? 0) * CHARACTER_WIDTH + 15
    const prefer = x >= width / 2 ? 1 : -1
    const offset = below ? 19 : -TEXT_HEIGHT / 2
    if (trySide(prefer) || trySide(-prefer)) return
    element.hidden = true

    function trySide(side: number) {
      for (const clearance of CLEARANCES) {
        const left = side > 0 ? x + clearance : x - clearance - textWidth
        const right = left + textWidth
        if (left < EDGE_MARGIN || right > width - EDGE_MARGIN) continue
        for (const lane of LANES) {
          const top = y + offset + lane
          if (top < EDGE_MARGIN || top + TEXT_HEIGHT > height - EDGE_MARGIN) continue
          if (overlaps(left, top, right, top + TEXT_HEIGHT)) continue
          reserve(left, top, right, top + TEXT_HEIGHT)
          const dx = side > 0 ? left - x : right - x
          const dy = top + TEXT_HEIGHT / 2 - y
          element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
          element.style.setProperty('--tag-x', `${(left - x).toFixed(1)}px`)
          element.style.setProperty('--tag-y', `${(top - y).toFixed(1)}px`)
          element.style.setProperty('--leader-length', `${Math.hypot(dx, dy).toFixed(1)}px`)
          element.style.setProperty('--leader-angle', `${Math.atan2(dy, dx).toFixed(3)}rad`)
          element.hidden = false
          return true
        }
      }
      return false
    }
  }

  return { begin, place, locate, reserve }
}
