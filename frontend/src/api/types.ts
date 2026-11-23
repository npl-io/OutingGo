export interface User {
  id: number
  email: string
  fullName: string
  phone: string | null
  avatarUrl: string | null
  role: 'ADMIN' | 'MODERATOR' | 'USER'
  isActive: boolean
  createdAt: string
}

export interface ApiErrorDetails {
  field: string
  message: string
}

export interface PageMeta {
  page: number
  pageSize: number
  total: number
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: ApiErrorDetails[]

  constructor(status: number, code: string, message: string, details?: ApiErrorDetails[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
