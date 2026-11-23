export const PAGE_SIZES = [10, 20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20

export const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'district:asc,name:asc', label: 'Area, then name' },
  { value: 'priceLevel:asc,name:asc', label: 'Price: low to high' },
  { value: 'priceLevel:desc,name:asc', label: 'Price: high to low' },
]

export const DEFAULT_SORT = 'name:asc'

export interface VenueFilters {
  q: string
  categoryId: number | null
  district: string
  priceLevel: number | null
  openAt: string
  sort: string
  page: number
  pageSize: number
}

type PageSize = (typeof PAGE_SIZES)[number]

const OPEN_AT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(value)
}

export function parseVenueFilters(params: URLSearchParams): VenueFilters {
  const q = (params.get('q') ?? '').trim().slice(0, 100)

  const categoryIdRaw = Number(params.get('categoryId'))
  const categoryId = Number.isInteger(categoryIdRaw) && categoryIdRaw > 0 ? categoryIdRaw : null

  const district = params.get('district') ?? ''

  const priceLevelRaw = Number(params.get('priceLevel'))
  const priceLevel =
    Number.isInteger(priceLevelRaw) && priceLevelRaw >= 1 && priceLevelRaw <= 4 ? priceLevelRaw : null

  const openAtRaw = params.get('openAt') ?? ''
  const openAt = OPEN_AT_PATTERN.test(openAtRaw) ? openAtRaw : ''

  const sortRaw = params.get('sort') ?? DEFAULT_SORT
  const sort = SORT_OPTIONS.some((option) => option.value === sortRaw) ? sortRaw : DEFAULT_SORT

  const pageRaw = Number(params.get('page'))
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1

  const pageSizeRaw = Number(params.get('pageSize'))
  const pageSize = isPageSize(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE

  return { q, categoryId, district, priceLevel, openAt, sort, page, pageSize }
}

export function toSearchParams(filters: VenueFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q !== '') params.set('q', filters.q)
  if (filters.categoryId !== null) params.set('categoryId', String(filters.categoryId))
  if (filters.district !== '') params.set('district', filters.district)
  if (filters.priceLevel !== null) params.set('priceLevel', String(filters.priceLevel))
  if (filters.openAt !== '') params.set('openAt', filters.openAt)
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  if (filters.page !== 1) params.set('page', String(filters.page))
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(filters.pageSize))
  return params
}

export function toApiQuery(filters: VenueFilters): string {
  const params = toSearchParams(filters)
  params.set('page', String(filters.page))
  params.set('pageSize', String(filters.pageSize))
  return params.toString()
}
