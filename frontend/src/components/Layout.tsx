import type { ReactElement } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function Layout(): ReactElement {
  const { user, status, logout } = useAuth()
  const authenticated = status === 'authenticated' && user !== null

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg font-bold text-gray-900">
              OutingGo
            </Link>
            {authenticated ? (
              <NavLink
                to="/venues"
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-semibold text-blue-600'
                    : 'text-sm font-medium text-gray-700 hover:text-gray-900'
                }
              >
                Venues
              </NavLink>
            ) : null}
          </div>
          {authenticated && user ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm font-medium text-gray-900">{user.fullName}</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {user.role}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          ) : status !== 'loading' ? (
            <nav className="flex items-center gap-4">
              <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Register
              </Link>
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
