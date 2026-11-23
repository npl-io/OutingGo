import type { ReactElement, ReactNode } from 'react'

interface HighlightProps {
  text: string
  query: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function Highlight({ text, query }: HighlightProps): ReactElement {
  const trimmed = query.trim()
  if (trimmed === '') {
    return <>{text}</>
  }

  const regex = new RegExp(escapeRegExp(trimmed), 'gi')
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    nodes.push(
      <mark key={match.index} className="rounded bg-yellow-200 px-0.5">
        {match[0]}
      </mark>,
    )
    lastIndex = match.index + match[0].length
    if (match[0].length === 0) {
      break
    }
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return <>{nodes}</>
}
