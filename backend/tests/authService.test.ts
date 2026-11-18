import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { login, register, verifyToken } from '../src/services/authService';
import * as userRepository from '../src/repositories/userRepository';

vi.mock('../src/repositories/userRepository', () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '1h',
  },
}));

const baseUser = {
  id: 1,
  email: 'user@example.com',
  fullName: 'Test User',
  phone: null,
  avatarUrl: null,
  role: 'USER',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

describe('authService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes the password and returns the created user without passwordHash', async () => {
    vi.mocked(userRepository.create).mockResolvedValue(baseUser);

    const user = await register({
      email: 'user@example.com',
      password: 'Password1',
      fullName: 'Test User',
    });

    expect(user).toEqual(baseUser);
    expect(user).not.toHaveProperty('passwordHash');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        fullName: 'Test User',
        phone: null,
      }),
    );

    const createArg = vi.mocked(userRepository.create).mock.calls[0]?.[0] as {
      passwordHash: string;
    };
    expect(createArg.passwordHash).not.toBe('Password1');
    expect(bcrypt.compareSync('Password1', createArg.passwordHash)).toBe(true);
  });

  it('translates a PostgreSQL unique violation into EMAIL_TAKEN', async () => {
    const uniqueError = Object.assign(new Error('duplicate key value'), { code: '23505' });
    vi.mocked(userRepository.create).mockRejectedValue(uniqueError);

    await expect(
      register({ email: 'user@example.com', password: 'Password1', fullName: 'Test User' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', httpStatus: 409 });
  });
});

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a token accepted by verifyToken and a user without passwordHash', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({
      ...baseUser,
      passwordHash: bcrypt.hashSync('Password1', 10),
    });

    const result = await login({ email: 'user@example.com', password: 'Password1' });

    expect(result.user).toEqual(baseUser);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(verifyToken(result.token)).toEqual({ userId: '1', role: 'USER' });
  });

  it('throws INVALID_CREDENTIALS for a wrong password', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({
      ...baseUser,
      passwordHash: bcrypt.hashSync('Password1', 10),
    });

    await expect(
      login({ email: 'user@example.com', password: 'WrongPass1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', httpStatus: 401 });
  });

  it('throws INVALID_CREDENTIALS for an unknown email and still compares a dummy hash', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    const compareSpy = vi.spyOn(bcrypt, 'compare');

    try {
      await expect(
        login({ email: 'ghost@example.com', password: 'Password1' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', httpStatus: 401 });
      expect(compareSpy).toHaveBeenCalledTimes(1);
    } finally {
      compareSpy.mockRestore();
    }
  });

  it('throws ACCOUNT_DISABLED for an inactive user', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({
      ...baseUser,
      passwordHash: bcrypt.hashSync('Password1', 10),
      isActive: false,
    });

    await expect(
      login({ email: 'user@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED', httpStatus: 403 });
  });
});
