import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/types'
import { useAuth } from '../auth/useAuth'
import type { RegisterInput } from '../auth/AuthContext'
import TextField from '../components/TextField'
import { validateEmail, validateFullName, validatePassword, validatePhone } from '../lib/validation'

interface RegisterFieldErrors {
  fullName?: string
  email?: string
  phone?: string
  password?: string
}

interface RegisterLocationState {
  from?: { pathname?: string }
}

export default function RegisterPage(): ReactElement {
  const { status, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  const from = (location.state as RegisterLocationState | null)?.from?.pathname ?? '/'

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) {
      return
    }

    const errors: RegisterFieldErrors = {}
    const fullNameError = validateFullName(fullName)
    if (fullNameError) {
      errors.fullName = fullNameError
    }
    const emailError = validateEmail(email)
    if (emailError) {
      errors.email = emailError
    }
    const phoneError = validatePhone(phone)
    if (phoneError) {
      errors.phone = phoneError
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      errors.password = passwordError
    }

    setFormError(null)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    const input: RegisterInput = {
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      phone: phone.trim().length === 0 ? undefined : phone.trim(),
    }

    setSubmitting(true)
    try {
      await register(input)
      navigate(from, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'EMAIL_TAKEN') {
          setFieldErrors({ email: 'This email is already registered' })
        } else if (error.details && error.details.length > 0) {
          const next: RegisterFieldErrors = {}
          for (const detail of error.details) {
            const field = detail.field.replace(/^body\./, '')
            if (field === 'fullName') {
              next.fullName = detail.message
            } else if (field === 'email') {
              next.email = detail.message
            } else if (field === 'phone') {
              next.phone = detail.message
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Create an account</h1>
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
          id="fullName"
          label="Full name"
          type="text"
          value={fullName}
          onChange={setFullName}
          error={fieldErrors.fullName}
          autoComplete="name"
          disabled={submitting}
        />
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
          id="phone"
          label="Phone (optional)"
          type="tel"
          value={phone}
          onChange={setPhone}
          error={fieldErrors.phone}
          autoComplete="tel"
          disabled={submitting}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          autoComplete="new-password"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Login
          </Link>
        </p>
      </form>
    </div>
  )
}
