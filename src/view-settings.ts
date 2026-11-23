export interface ViewSettings {
  quality: 'auto' | 'smooth' | 'high'
  frame: 'galactic' | 'system'
  bloom: number
  dust: number
  armLabels: boolean
  skyLabels: boolean
  survey: boolean
  photographs: boolean
  stars: boolean
  trails: boolean
  rings: boolean
}

export const defaultViewSettings: ViewSettings = {
  quality: 'auto',
  frame: 'galactic',
  bloom: 69,
  dust: 100,
  armLabels: true,
  skyLabels: true,
  survey: true,
  photographs: true,
  stars: true,
  trails: true,
  rings: true,
}
