import { apiFetch } from './client'
import type { City, TripResult } from './types'

export function listCities(signal?: AbortSignal): Promise<City[]> {
  return apiFetch<City[]>('/api/cities', signal ? { signal } : undefined)
}

export function searchTrips(
  origin: number,
  destination: number,
  date: string,
  signal?: AbortSignal,
): Promise<TripResult[]> {
  const params = new URLSearchParams({
    origin: String(origin),
    destination: String(destination),
    date,
  })
  return apiFetch<TripResult[]>(`/api/trips?${params.toString()}`, { signal })
}
