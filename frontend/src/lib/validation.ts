const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?\d{8,20}$/
const LETTER_REGEX = /[A-Za-z]/
const DIGIT_REGEX = /\d/

export function validateEmail(email: string): string | null {
  const normalized = email.trim()
  if (normalized.length === 0) {
    return 'Email is required'
  }
  if (!EMAIL_REGEX.test(normalized)) {
    return 'Enter a valid email address'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length === 0) {
    return 'Password is required'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  if (!LETTER_REGEX.test(password) || !DIGIT_REGEX.test(password)) {
    return 'Password must contain at least one letter and one digit'
  }
  if (new TextEncoder().encode(password).length > 72) {
    return 'Password must be at most 72 bytes'
  }
  return null
}

export function validateFullName(fullName: string): string | null {
  const normalized = fullName.trim()
  if (normalized.length === 0) {
    return 'Full name is required'
  }
  if (normalized.length < 2) {
    return 'Full name must be at least 2 characters'
  }
  if (normalized.length > 100) {
    return 'Full name must be at most 100 characters'
  }
  return null
}

export function validatePhone(phone: string): string | null {
  const normalized = phone.trim()
  if (normalized.length === 0) {
    return null
  }
  if (!PHONE_REGEX.test(normalized)) {
    return 'Enter a valid phone number'
  }
  return null
}
