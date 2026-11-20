import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/types'
import { useAuth } from '../auth/useAuth'
import TextField from '../components/TextField'
import { validateEmail } from '../lib/validation'

interface LoginFieldErrors {
  email?: string
  password?: string
}

interface LoginLocationState {
  from?: { pathname?: string }
}

export default function LoginPage(): ReactElement {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  const from = (location.state as LoginLocationState | null)?.from?.pathname ?? '/'

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) {
      return
    }

    const errors: LoginFieldErrors = {}
    const emailError = validateEmail(email)
    if (emailError) {
      errors.email = emailError
    }
    if (password.trim().length === 0) {
      errors.password = 'Password is required'
    }

    setFormError(null)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      await login(email.trim().toLowerCase(), password)
      navigate(from, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.details && error.details.length > 0) {
          const next: LoginFieldErrors = {}
          for (const detail of error.details) {
            const field = detail.field.replace(/^body\./, '')
            if (field === 'email') {
              next.email = detail.message
            } else if (field === 'password') {
              next.password = detail.message
            }
          }
          setFieldErrors(next)
        } else {
          setFormError(error.message)
        }
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Sign in</h1>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {formError}
          </div>
        ) : null}
        <TextField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          autoComplete="email"
          disabled={submitting}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          autoComplete="current-password"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-blue-600 hover:text-blue-700">
            Register
          </Link>
        </p>
      </form>
    </div>
  )
}
