import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Line, LineDashedMaterial, Vector3 } from 'three'
import { sampleSystem, type System } from './systems'

export function createTrailAxis() {
  const count = 60
  const positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage)
  const distances = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', positions)
  geometry.setAttribute('lineDistance', distances)
  const line = new Line(geometry, new LineDashedMaterial({
    color: '#a1dbe5', dashSize: 0.43, gapSize: 0.48, opacity: 0.39, transparent: true, depthWrite: false,
  }))
  line.frustumCulled = false
  line.renderOrder = 1
  line.visible = false
  const point = new Vector3()
  const previous = new Vector3()
  let lastSystem: System | undefined
  let lastTime = NaN
  let lastLength = NaN

  function update(system: System, time: number, length: number) {
    if (system === lastSystem && time === lastTime && length === lastLength) return
    lastSystem = system
    lastTime = time
    lastLength = length
    let distance = 0
    for (let index = 0; index < count; index++) {
      sampleSystem(system, time - index * length / (count - 1), point)
      if (index > 0) distance += previous.distanceTo(point)
      positions.setXYZ(index, point.x, point.y, point.z)
      distances.setX(index, distance)
      previous.copy(point)
    }
    positions.needsUpdate = true
    distances.needsUpdate = true
  }

  return { line, update }
}
