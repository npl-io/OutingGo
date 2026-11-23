import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchCategories, fetchDistricts, fetchVenues } from '../api/venues'
import { ApiError } from '../api/types'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  PAGE_SIZES,
  SORT_OPTIONS,
  parseVenueFilters,
  toSearchParams,
} from '../lib/venueQuery'
import type { VenueFilters } from '../lib/venueQuery'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import VenueCard from '../components/VenueCard'
import Pagination from '../components/Pagination'

const CONTROL_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

const LABEL_CLASS = 'mb-1 block text-sm font-medium text-gray-700'

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

const PRICE_OPTIONS = [
  { value: '', label: 'Any price' },
  { value: '1', label: '₫' },
  { value: '2', label: '₫₫' },
  { value: '3', label: '₫₫₫' },
  { value: '4', label: '₫₫₫₫' },
] as const

function mergeFilters(current: VenueFilters, next: Partial<VenueFilters>): VenueFilters {
  const merged = { ...current, ...next }
  if (!('page' in next)) {
    merged.page = 1
  }
  return merged
}

function VenueCardSkeleton(): ReactElement {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-4 w-2/3 rounded bg-gray-200" />
      <div className="mt-3 h-3 w-1/2 rounded bg-gray-200" />
      <div className="mt-2 h-3 w-1/3 rounded bg-gray-200" />
    </div>
  )
}

export default function VenuesPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseVenueFilters(searchParams)

  const [searchText, setSearchText] = useState(filters.q)
  const debouncedSearch = useDebouncedValue(searchText, 300)

  const resultsRef = useRef<HTMLHeadingElement>(null)
  const previousPageRef = useRef(filters.page)
  const lastWrittenQRef = useRef(filters.q)

  const venuesQuery = useQuery({
    queryKey: ['venues', filters],
    queryFn: () => fetchVenues(filters),
    placeholderData: keepPreviousData,
    staleTime: 30000,
  })
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: Infinity,
  })
  const districtsQuery = useQuery({
    queryKey: ['districts'],
    queryFn: fetchDistricts,
    staleTime: Infinity,
  })

  const updateFilters = useCallback(
    (next: Partial<VenueFilters>, options?: { replace?: boolean }): void => {
      setSearchParams((prev) => toSearchParams(mergeFilters(parseVenueFilters(prev), next)), options)
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (debouncedSearch === lastWrittenQRef.current) return
    lastWrittenQRef.current = debouncedSearch
    updateFilters({ q: debouncedSearch }, { replace: true })
  }, [debouncedSearch, updateFilters])

  useEffect(() => {
    if (previousPageRef.current === filters.page) return
    previousPageRef.current = filters.page
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [filters.page])

  const hasActiveFilters =
    filters.q !== '' ||
    filters.categoryId !== null ||
    filters.district !== '' ||
    filters.priceLevel !== null ||
    filters.openAt !== '' ||
    filters.sort !== DEFAULT_SORT ||
    filters.pageSize !== DEFAULT_PAGE_SIZE

  const clearFilters = (): void => {
    setSearchText('')
    setSearchParams(new URLSearchParams())
  }

  const { data, isPending, isFetching, isError, error, refetch } = venuesQuery

  const total = data?.meta.total ?? 0
  const venues = data?.data ?? []
  const from = (filters.page - 1) * filters.pageSize + 1
  const to = Math.min(filters.page * filters.pageSize, total)
  const summaryText =
    total === 0
      ? 'No results'
      : venues.length === 0
        ? 'This page has no results'
        : `Showing ${from}–${to} of ${total} results`

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900">Venues</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="venue-search" className={LABEL_CLASS}>
            Search name or address
          </label>
          <input
            id="venue-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search name or address"
            className={CONTROL_CLASS}
          />
        </div>

        <div>
          <label htmlFor="venue-category" className={LABEL_CLASS}>
            Category
          </label>
          <select
            id="venue-category"
            value={filters.categoryId?.toString() ?? ''}
            onChange={(event) =>
              updateFilters({ categoryId: event.target.value === '' ? null : Number(event.target.value) })
            }
            className={CONTROL_CLASS}
          >
            <option value="">All categories</option>
            {categoriesQuery.data?.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="venue-area" className={LABEL_CLASS}>
            Area
          </label>
          <select
            id="venue-area"
            value={filters.district}
            onChange={(event) => updateFilters({ district: event.target.value })}
            className={CONTROL_CLASS}
          >
            <option value="">All areas</option>
            {districtsQuery.data?.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="venue-price" className={LABEL_CLASS}>
            Price
          </label>
          <select
            id="venue-price"
            value={filters.priceLevel?.toString() ?? ''}
            onChange={(event) =>
              updateFilters({ priceLevel: event.target.value === '' ? null : Number(event.target.value) })
            }
            className={CONTROL_CLASS}
          >
            {PRICE_OPTIONS.map((option) => (
              <option key={option.value === '' ? 'any' : option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="venue-open-at" className={LABEL_CLASS}>
            Open at
          </label>
          <div className="flex items-center gap-2">
            <input
              id="venue-open-at"
              type="time"
              value={filters.openAt}
              onChange={(event) => updateFilters({ openAt: event.target.value })}
              className={`${CONTROL_CLASS} flex-1`}
            />
            {filters.openAt !== '' ? (
              <button
                type="button"
                onClick={() => updateFilters({ openAt: '' })}
                className="shrink-0 rounded-md px-2 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="venue-sort" className={LABEL_CLASS}>
            Sort
          </label>
          <select
            id="venue-sort"
            value={filters.sort}
            onChange={(event) => updateFilters({ sort: event.target.value })}
            className={CONTROL_CLASS}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="venue-page-size" className={LABEL_CLASS}>
            Per page
          </label>
          <select
            id="venue-page-size"
            value={String(filters.pageSize)}
            onChange={(event) => updateFilters({ pageSize: Number(event.target.value) })}
            className={CONTROL_CLASS}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters ? (
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {isPending ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }, (_, index) => (
            <VenueCardSkeleton key={index} />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-700">
            {error instanceof ApiError ? error.message : 'Something went wrong'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            Retry
          </button>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 ref={resultsRef} className="text-lg font-semibold text-gray-900">
            Results
          </h2>
          <p aria-live="polite" className="text-sm text-gray-600">
            {summaryText}
          </p>
          {isFetching ? <p className="text-sm text-gray-500">Updating…</p> : null}
          {venues.length > 0 ? (
            <div className={isFetching ? `${GRID_CLASS} opacity-60` : GRID_CLASS}>
              {venues.map((venue) => (
                <VenueCard key={venue.id} venue={venue} q={filters.q} />
              ))}
            </div>
          ) : total > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
              <p className="text-sm text-gray-700">This page has no results</p>
              <button
                type="button"
                onClick={() => updateFilters({ page: 1 })}
                className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                Go to page 1
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
              <p className="text-sm text-gray-700">No venues match your filters</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                Clear filters
              </button>
            </div>
          )}
          <Pagination
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
            onChange={(page) => updateFilters({ page })}
          />
        </section>
      )}
    </div>
  )
}
