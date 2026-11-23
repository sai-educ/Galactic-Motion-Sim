// Render between fixed ticks. The orbits are analytic, so no state is integrated
// or lost when a tab is suspended or playback is paused between ticks.
export class SimulationClock {
  private static readonly step = 1 / 120
  private ticks = 0
  private remainder = 0

  get time() {
    return this.ticks * SimulationClock.step + this.remainder
  }

  advance(delta: number, rate: number) {
    this.remainder += Math.min(Math.max(delta, 0), 0.05) * rate
    const elapsedTicks = Math.floor(this.remainder / SimulationClock.step)
    this.ticks += elapsedTicks
    this.remainder -= elapsedTicks * SimulationClock.step
  }

  reset() {
    this.seek(0)
  }

  seek(time: number) {
    this.ticks = Math.floor(time / SimulationClock.step)
    this.remainder = time - this.ticks * SimulationClock.step
  }
}
