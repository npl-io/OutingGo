import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import './helpers/setupTestEnv';
import bcrypt from 'bcrypt';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { authenticate } from '../src/middlewares/authenticate';
import { authorize } from '../src/middlewares/authorize';
import { errorHandler } from '../src/middlewares/errorHandler';
import { createAuthRateLimiter } from '../src/middlewares/rateLimiters';
import { closePool, resetDb } from './helpers/testDb';

const REGISTER_PATH = '/api/v1/auth/register';
const LOGIN_PATH = '/api/v1/auth/login';
const ME_PATH = '/api/v1/auth/me';
const PASSWORD = 'Password123';

type TestResponse = {
  status: number;
  text: string;
  body: unknown;
};

type UserJson = {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

type ErrorJson = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

async function get(target: Express, path: string, token?: string): Promise<TestResponse> {
  let req = request(target).get(path);
  if (token !== undefined) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  const res = await req;
  return { status: res.status, text: res.text, body: res.body };
}

async function post(target: Express, path: string, body: unknown): Promise<TestResponse> {
  const res = await request(target).post(path).send(body as object);
  return { status: res.status, text: res.text, body: res.body };
}

function registerUser(
  email: string,
  fullName: string,
  extra?: Record<string, unknown>,
): Promise<TestResponse> {
  return post(app, REGISTER_PATH, { email, password: PASSWORD, fullName, ...extra });
}

function expectNoPasswordHash(res: TestResponse): void {
  expect(res.text).not.toContain('passwordHash');
  expect(res.text).not.toContain('password_hash');
}

describe('auth integration', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closePool();
  });

  it('registers, logs in, and returns the same user from /me', async () => {
    const email = 'alice@example.com';
    const reg = await post(app, REGISTER_PATH, { email, password: PASSWORD, fullName: 'Alice' });
    expect(reg.status).toBe(201);
    expectNoPasswordHash(reg);

    const regUser = (reg.body as { data: { user: UserJson } }).data.user;
    expect(regUser.email).toBe(email);
    expect(regUser.fullName).toBe('Alice');
    expect(regUser.role).toBe('USER');
    expect(regUser.isActive).toBe(true);

    const login = await post(app, LOGIN_PATH, { email, password: PASSWORD });
    expect(login.status).toBe(200);
    expectNoPasswordHash(login);

    const { token, user: loginUser } = (login.body as {
      data: { token: string; user: UserJson };
    }).data;
    expect(token.length).toBeGreaterThan(0);
    expect(loginUser.id).toBe(regUser.id);

    const me = await get(app, ME_PATH, token);
    expect(me.status).toBe(200);
    expectNoPasswordHash(me);

    const meUser = (me.body as { data: { user: UserJson } }).data.user;
    expect(meUser.id).toBe(regUser.id);
    expect(meUser.email).toBe(email);
  });

  it('rejects duplicate emails with 409, including different letter case', async () => {
    await registerUser('dup@example.com', 'First');
    const duplicate = await registerUser('dup@example.com', 'Second');
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as ErrorJson).error.code).toBe('EMAIL_TAKEN');

    const differentCase = await registerUser('DUP@example.com', 'Third');
    expect(differentCase.status).toBe(409);
    expect((differentCase.body as ErrorJson).error.code).toBe('EMAIL_TAKEN');
  });

  it('returns the same 401 for wrong password and unknown email', async () => {
    await registerUser('known@example.com', 'Known');
    const wrongPassword = await post(app, LOGIN_PATH, {
      email: 'known@example.com',
      password: 'WrongPass123',
    });
    const unknownEmail = await post(app, LOGIN_PATH, {
      email: 'ghost@example.com',
      password: PASSWORD,
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((wrongPassword.body as ErrorJson).error.code).toBe('INVALID_CREDENTIALS');
    expect((unknownEmail.body as ErrorJson).error.code).toBe('INVALID_CREDENTIALS');
    expect((wrongPassword.body as ErrorJson).error.message).toBe(
      (unknownEmail.body as ErrorJson).error.message,
    );
  });

  it('returns 422 with field details for invalid register input', async () => {
    const res = await post(app, REGISTER_PATH, {
      email: 'not-an-email',
      password: 'short',
      fullName: '',
    });
    expect(res.status).toBe(422);

    const body = res.body as ErrorJson;
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const details = body.error.details as { field: string; message: string }[] | undefined;
    const fields = (details ?? []).map((detail) => detail.field);
    expect(fields).toContain('body.email');
    expect(fields).toContain('body.password');
    expect(fields).toContain('body.fullName');
  });

  it('ignores a role field in the register body', async () => {
    const res = await registerUser('bob@example.com', 'Bob', { role: 'ADMIN' });
    expect(res.status).toBe(201);

    const user = (res.body as { data: { user: UserJson } }).data.user;
    expect(user.role).toBe('USER');
  });

  it('requires a valid bearer token for /me', async () => {
    const noToken = await get(app, ME_PATH);
    expect(noToken.status).toBe(401);

    const malformed = await get(app, ME_PATH, 'not-a-valid-token');
    expect(malformed.status).toBe(401);

    await registerUser('carol@example.com', 'Carol');
    const login = await post(app, LOGIN_PATH, { email: 'carol@example.com', password: PASSWORD });
    const token = (login.body as { data: { token: string } }).data.token;

    const tampered = await get(app, ME_PATH, `${token}x`);
    expect(tampered.status).toBe(401);
  });

  it('blocks login for an inactive user with 403', async () => {
    await registerUser('dave@example.com', 'Dave');
    await pool.query('UPDATE users SET is_active = FALSE WHERE email = $1', ['dave@example.com']);

    const res = await post(app, LOGIN_PATH, { email: 'dave@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
    expect((res.body as ErrorJson).error.code).toBe('ACCOUNT_DISABLED');
  });

  it('enforces account-level roles with authorize', async () => {
    const adminApp = express();
    adminApp.get('/admin-only', authenticate, authorize('ADMIN'), (_req, res) => {
      res.status(200).json({ data: { ok: true } });
    });
    adminApp.use(errorHandler);

    await registerUser('member@example.com', 'Member');
    const memberLogin = await post(app, LOGIN_PATH, { email: 'member@example.com', password: PASSWORD });
    const memberToken = (memberLogin.body as { data: { token: string } }).data.token;

    const forbidden = await get(adminApp, '/admin-only', memberToken);
    expect(forbidden.status).toBe(403);
    expect((forbidden.body as ErrorJson).error.code).toBe('FORBIDDEN');

    const adminHash = await bcrypt.hash(PASSWORD, 10);
    await pool.query(
      "INSERT INTO users (email, password_hash, full_name, role_id, created_by, updated_by) VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'ADMIN'), NULL, NULL)",
      ['admin@example.com', adminHash, 'Admin'],
    );

    const adminLogin = await post(app, LOGIN_PATH, { email: 'admin@example.com', password: PASSWORD });
    expect(adminLogin.status).toBe(200);
    const adminToken = (adminLogin.body as { data: { token: string } }).data.token;

    const allowed = await get(adminApp, '/admin-only', adminToken);
    expect(allowed.status).toBe(200);
    expect((allowed.body as { data: { ok: boolean } }).data.ok).toBe(true);
  });

  it('returns 429 after exceeding the auth rate limit', async () => {
    const limitedApp = express();
    const limiter = createAuthRateLimiter({ windowMs: 60000, max: 2 });
    limitedApp.post('/limited', limiter, (_req, res) => {
      res.status(200).json({ data: { ok: true } });
    });

    const first = await post(limitedApp, '/limited', {});
    const second = await post(limitedApp, '/limited', {});
    const third = await post(limitedApp, '/limited', {});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect((third.body as ErrorJson).error.code).toBe('TOO_MANY_REQUESTS');
  });
});
