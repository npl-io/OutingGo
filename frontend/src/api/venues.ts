import { apiFetch, apiFetchPage } from './client'
import type { PageMeta } from './types'
import { toApiQuery } from '../lib/venueQuery'
import type { VenueFilters } from '../lib/venueQuery'

export interface Category {
  id: number
  name: string
  slug: string
}

export interface Venue {
  id: number
  name: string
  address: string | null
  district: string | null
  lat: number
  lng: number
  category: Category
  priceLevel: 1 | 2 | 3 | 4
  openingTime: string
  closingTime: string
  phone: string | null
  description: string | null
}

export function fetchVenues(filters: VenueFilters): Promise<{ data: Venue[]; meta: PageMeta }> {
  return apiFetchPage<Venue[]>(`/venues?${toApiQuery(filters)}`)
}

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories')
}

export function fetchDistricts(): Promise<string[]> {
  return apiFetch<string[]>('/venues/districts')
}
