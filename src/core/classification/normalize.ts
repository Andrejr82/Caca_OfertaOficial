import type { Voltage } from './types'

export function normalizeTitle(title: string): string {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function extractCapacityLiters(title: string): number | undefined {
  const match = title.match(/(\d+(?:[,.]\d+)?)\s*(?:l|litros?)\b/i)
  return match ? Number(match[1].replace(',', '.')) : undefined
}

export function extractVoltage(title: string): Voltage | undefined {
  if (/bivolt/i.test(title)) return 'BIVOLT'
  const match = title.match(/\b(127|220)\s*v\b/i)
  return match ? `${match[1]}V` as Voltage : undefined
}

export function extractModel(title: string): string | undefined {
  return title.match(/\b[A-Z]{2,}\d+[A-Z\d-]*\b/i)?.[0]?.replace(/-/g, '').toUpperCase()
}

export function extractPowerWatts(title: string): number | undefined {
  const match = title.match(/(\d+(?:[,.]\d+)?)\s*w(?:atts?)?\b/i)
  return match ? Number(match[1].replace(',', '.')) : undefined
}
