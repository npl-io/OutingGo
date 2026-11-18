import { query } from '../config/db';

export type UserRecord = {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
};

export type UserWithPassword = UserRecord & {
  passwordHash: string;
};

type UserRow = UserRecord;

type UserPasswordRow = UserWithPassword;

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string | null;
}

const USER_COLUMNS = `
  u.id,
  u.email,
  u.full_name AS "fullName",
  u.phone,
  u.avatar_url AS "avatarUrl",
  r.name AS role,
  u.is_active AS "isActive",
  u.created_at AS "createdAt"
`;

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

function mapUserWithPassword(row: UserPasswordRow): UserWithPassword {
  return {
    ...mapUser(row),
    passwordHash: row.passwordHash,
  };
}

export async function findByEmail(email: string): Promise<UserWithPassword | null> {
  const result = await query<UserPasswordRow>(
    `SELECT ${USER_COLUMNS}, u.password_hash AS "passwordHash"
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
    [email],
  );

  const row = result.rows[0];
  return row ? mapUserWithPassword(row) : null;
}

export async function findById(id: number): Promise<UserRecord | null> {
  const result = await query<UserRow>(
    `SELECT ${USER_COLUMNS}
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function create(input: CreateUserInput): Promise<UserRecord> {
  const result = await query<UserRow>(
    `WITH inserted AS (
       INSERT INTO users (email, password_hash, full_name, phone, role_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, (SELECT id FROM roles WHERE name = 'USER'), NULL, NULL)
       RETURNING id, email, full_name, phone, avatar_url, role_id, is_active, created_at
     )
     SELECT
       i.id,
       i.email,
       i.full_name AS "fullName",
       i.phone,
       i.avatar_url AS "avatarUrl",
       r.name AS role,
       i.is_active AS "isActive",
       i.created_at AS "createdAt"
     FROM inserted i
     JOIN roles r ON r.id = i.role_id`,
    [input.email, input.passwordHash, input.fullName, input.phone ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('User insert returned no row');
  }

  return mapUser(row);
}
