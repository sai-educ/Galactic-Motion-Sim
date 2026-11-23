const paths = {
  galaxy: '<ellipse cx="12" cy="12" rx="10.1" ry="4.6" transform="rotate(-34 12 12)"/><ellipse cx="12" cy="12" rx="6.3" ry="2.55" transform="rotate(-34 12 12)"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="6.6" r="1.65" fill="currentColor" stroke="none"/>',
  crosshair: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5m0 9v5m9.5-9.5h-5m-9 0h-5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.5v5"/><circle cx="12" cy="7.75" r=".9" fill="currentColor" stroke="none"/>',
  tag: '<path d="M20.5 13 13 20.5 4 11.5V4h7.5l9 9Z"/><circle cx="8.2" cy="8.2" r="1" fill="currentColor" stroke="none"/>',
  expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  collapse: '<path d="M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z"/>',
  route: '<circle cx="6" cy="6.5" r="2"/><circle cx="18" cy="17.5" r="2"/><path d="M8 6.5h8.5a2.75 2.75 0 0 1 0 5.5h-9a2.75 2.75 0 0 0 0 5.5H16"/>',
  telescope: '<path d="m3 10 13-5 2 5-13 5-2-5ZM16 5l3-1 2 5-3 1M11 13l-3 7m3-7 3 7m-3-7v7"/>',
  sliders: '<path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h10m4 0h2M11 4v4m-4 2v4m7 2v4"/>',
  mouse: '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 6.5v4"/>',
  orientation: '<circle cx="12" cy="12" r="8.7" stroke-dasharray="1.3 3.2"/><path d="M12 2v4m10 6h-4M12 22v-4M2 12h4m3 3 3-9 3 9-3-1.5L9 15Z"/>',
  pause: '<path d="M9 5.5v13m6-13v13" stroke-width="2.2"/>',
  play: '<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>',
  reset: '<path d="M4 11a8 8 0 1 1 2.1 6.7M4 5v6h6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v5l3 1.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h13m-5-5 5 5-5 5"/>',
} as const

export function icon(name: keyof typeof paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

export function mountIcons() {
  for (const target of document.querySelectorAll<HTMLElement>('[data-icon]')) {
    target.innerHTML = icon(target.dataset.icon as keyof typeof paths)
  }
}
