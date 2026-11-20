import type { ReactElement } from 'react'
import { useAuth } from '../auth/useAuth'

export default function HomePage(): ReactElement | null {
  const { user } = useAuth()

  if (!user) {
    return null
  }

  return (
    <div>
      <h1>
        Welcome, {user.fullName} ({user.role})
      </h1>
    </div>
  )
}
