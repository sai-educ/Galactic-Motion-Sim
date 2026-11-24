export interface Chapter {
  /** Seconds into the tour at which the chapter begins. */
  time: number
  /** Index into `systems`, or -1 for the Galaxy overview. */
  system: number
  title: string
  note: string
}

// The tour zooms into each system for about half a minute, then back out to the Galaxy before the next one,
// so every visit opens with the camera flying in and the music swelling into that system's theme.
export const chapters: Chapter[] = [
  { time: 0, system: -1, title: 'Milky Way overview',
    note: 'A barred spiral about 100,000 light-years across. All four systems on this tour start in one spot, 26,600 light-years from the center.' },
  { time: 6, system: 0, title: 'Solar System',
    note: 'The Sun carries its planets around the Galaxy at about 250 km/s. Their orbits are tipped 60° to the disk, so each planet traces a helix.' },
  { time: 36, system: -1, title: 'Back out to the Galaxy',
    note: 'At this scale the whole Solar System is a single point. Next, our nearest neighbors.' },
  { time: 44, system: 1, title: 'Alpha Centauri',
    note: 'Our nearest neighbors, 4.3 light-years away. Two Sun-like stars swing close and wide every 80 years while Proxima circles far outside.' },
  { time: 74, system: -1, title: 'One spot in the disk',
    note: 'Alpha Centauri is too close to the Sun to tell apart from here. Sirius, next, is twice as far away, at 8.6 light-years.' },
  { time: 82, system: 2, title: 'Sirius',
    note: 'The brightest star in the night sky has a white dwarf for a partner: an Earth-sized ember of a star once larger than Sirius itself.' },
  { time: 112, system: -1, title: 'Farther afield',
    note: 'The last stop, TRAPPIST-1, is about 41 light-years away. That is the farthest of the four, yet on this scale it shares the same spot.' },
  { time: 120, system: 3, title: 'TRAPPIST-1',
    note: 'Seven rocky planets hug a dim red star. It crosses the Sun’s neighborhood at 81 km/s on a stretched orbit that dips deep into the inner Galaxy.' },
  { time: 150, system: -1, title: 'Neighbors for now',
    note: 'Watch the four paths separate. Every star follows its own orbit, so today’s neighborhood is only a brief meeting.' },
]

export const TOUR_DURATION = 164
