import type { PerspectiveCamera, Vector3 } from 'three'

export interface Callout {
  element: HTMLElement
  caption: HTMLElement
}

export function createCallout(text: string, kind: 'body' | 'time' | 'arm' | 'sky', color?: string): Callout {
  const element = document.createElement(kind === 'sky' ? 'button' : 'div')
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

const lanes = [0, -23, 23, -46, 46, -69, 69, -92, 92]
const clearances = [14, 43, 76]

export function createCalloutLayout(camera: PerspectiveCamera, capacity: number) {
  const placed = new Float32Array(capacity * 4)
  let count = 0
  let width = 0
  let height = 0

  function begin(viewportWidth: number, viewportHeight: number) {
    width = viewportWidth
    height = viewportHeight
    count = 0
  }

  function overlaps(left: number, top: number, right: number, bottom: number) {
    for (let i = 0; i < count; i += 4) {
      if (left < placed[i + 2] + 4 && right > placed[i] - 4 && top < placed[i + 3] + 3 && bottom > placed[i + 1] - 3) return true
    }
    return false
  }

  function reserve(left: number, top: number, right: number, bottom: number) {
    placed[count++] = left
    placed[count++] = top
    placed[count++] = right
    placed[count++] = bottom
  }

  function place(tag: Callout, position: Vector3, below = false, bottomMargin = 139) {
    const { element, caption } = tag
    position.project(camera)
    const x = (position.x + 1) * width * 0.5
    const y = (1 - position.y) * height * 0.5
    if (position.z <= -1 || position.z >= 1 || x < 6 || x > width - 6 || y < 60 || y > height - 32) {
      element.hidden = true
      return
    }
    const textWidth = (caption.textContent?.length ?? 0) * 6.6 + 15
    const textHeight = 19
    const minTop = width < 560 ? 154 : 181
    const prefer = x >= width / 2 ? 1 : -1
    const offset = below ? 19 : -textHeight / 2
    if (trySide(prefer) || trySide(-prefer)) return
    element.hidden = true

    function trySide(side: number) {
      for (const clearance of clearances) {
        const left = side > 0 ? x + clearance : x - clearance - textWidth
        const right = left + textWidth
        if (left < 9 || right > width - 9) continue
        for (const lane of lanes) {
          const top = y + offset + lane
          if (top < minTop || top + textHeight > height - bottomMargin || overlaps(left, top, right, top + textHeight)) continue
          reserve(left, top, right, top + textHeight)
          const dx = side > 0 ? left - x : right - x
          const dy = top + textHeight / 2 - y
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

  return { begin, place, reserve }
}
