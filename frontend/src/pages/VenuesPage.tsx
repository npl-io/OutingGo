import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchVenues } from '../api/venues'
import { parseVenueFilters } from '../lib/venueQuery'

export default function VenuesPage(): ReactElement {
  const [searchParams] = useSearchParams()
  const filters = parseVenueFilters(searchParams)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['venues', filters],
    queryFn: () => fetchVenues(filters),
    placeholderData: keepPreviousData,
    staleTime: 30000,
  })

  const total = data?.meta.total ?? 0
  const from = (filters.page - 1) * filters.pageSize + 1
  const to = Math.min(filters.page * filters.pageSize, total)

  return (
    <div>
      <h1>Venues</h1>
      {isPending ? (
        <p>Loading…</p>
      ) : isError ? (
        <div>
          <p>{error instanceof Error ? error.message : 'Something went wrong'}</p>
          <button type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <p>{total === 0 ? 'No results' : `Showing ${from}–${to} of ${total} results`}</p>
          <ul>
            {data?.data.map((venue) => (
              <li key={venue.id}>{venue.name}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
