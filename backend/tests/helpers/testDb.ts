import { pool } from '../../src/config/db';

export async function resetDb(): Promise<void> {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query("INSERT INTO roles (name) VALUES ('ADMIN'), ('MODERATOR'), ('USER')");
}

export async function closePool(): Promise<void> {
  await pool.end();
}
