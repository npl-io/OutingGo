import type { ReactElement } from 'react'
import type { Venue } from '../api/venues'
import Highlight from './Highlight'

interface VenueCardProps {
  venue: Venue
  q: string
}

function formatTime(value: string): string {
  return value.slice(0, 5)
}

export default function VenueCard({ venue, q }: VenueCardProps): ReactElement {
  const opening = formatTime(venue.openingTime)
  const closing = formatTime(venue.closingTime)
  const isNextDay = closing < opening

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">
          <Highlight text={venue.name} query={q} />
        </h3>
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          {venue.category.name}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
        {venue.district ? <span>{venue.district}</span> : null}
        <span aria-label={`Price level ${venue.priceLevel} of 4`}>{'₫'.repeat(venue.priceLevel)}</span>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        {opening}–{closing}
        {isNextDay ? ' (next day)' : ''}
      </p>

      {venue.address ? (
        <p className="mt-1 text-sm text-gray-600">
          <Highlight text={venue.address} query={q} />
        </p>
      ) : null}

      {venue.phone ? <p className="mt-1 text-sm text-gray-600">{venue.phone}</p> : null}
    </article>
  )
}
