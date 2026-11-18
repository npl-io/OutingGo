import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import * as userRepository from '../repositories/userRepository';
import type { UserRecord, UserWithPassword } from '../repositories/userRepository';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema';

const BCRYPT_COST = 10;

// Compared against when the email is unknown so that both "unknown email" and
// "wrong password" take a similar amount of time. This is not a real password.
const DUMMY_PASSWORD_HASH = '$2b$10$wHv/vkbz9ZBE5fij9q3cpeCZjGcyqJoZbROMotDi2h5WqiT1UZF76';

export interface LoginResult {
  token: string;
  user: UserRecord;
}

export interface VerifiedToken {
  userId: string;
  role: string;
}

function toPublicUser(user: UserWithPassword): UserRecord {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

function signToken(user: UserRecord): string {
  const payload = { sub: String(user.id), role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
  });
}

export async function register(input: RegisterInput): Promise<UserRecord> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    return await userRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('EMAIL_TAKEN', 409, 'Email is already registered');
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await userRepository.findByEmail(input.email);

  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new AppError('ACCOUNT_DISABLED', 403, 'Account is disabled');
  }

  return { token: signToken(user), user: toPublicUser(user) };
}

export function verifyToken(token: string): VerifiedToken {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new AppError('INVALID_TOKEN', 401, 'Invalid or expired token');
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError('INVALID_TOKEN', 401, 'Invalid or expired token');
  }

  const { sub, role } = decoded as { sub?: unknown; role?: unknown };
  if (typeof sub !== 'string' || typeof role !== 'string') {
    throw new AppError('INVALID_TOKEN', 401, 'Invalid or expired token');
  }

  return { userId: sub, role };
}

