import type { ReactElement } from 'react'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

type PageItem = number | 'ellipsis'

function getPageItems(current: number, pageCount: number): PageItem[] {
  const visible = Array.from(new Set([1, pageCount, current, current - 1, current + 1]))
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b)

  const items: PageItem[] = []
  visible.forEach((value, index) => {
    if (index > 0 && value - visible[index - 1] > 1) {
      items.push('ellipsis')
    }
    items.push(value)
  })
  return items
}

const NAV_BUTTON_CLASS =
  'rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

export default function Pagination({ page, pageSize, total, onChange }: PaginationProps): ReactElement {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (pageCount <= 1) {
    return <></>
  }

  const items = getPageItems(page, pageCount)

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={NAV_BUTTON_CLASS}
      >
        Previous
      </button>

      {items.map((item, index) => {
        if (item === 'ellipsis') {
          return (
            <span key={`ellipsis-${index}`} className="px-1 text-sm text-gray-500">
              …
            </span>
          )
        }
        const isCurrent = item === page
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={isCurrent ? 'page' : undefined}
            className={
              isCurrent
                ? 'rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
                : NAV_BUTTON_CLASS
            }
          >
            {item}
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        className={NAV_BUTTON_CLASS}
      >
        Next
      </button>
    </nav>
  )
}
