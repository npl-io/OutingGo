import dotenv from 'dotenv';
import path from 'node:path';

// Load backend/.env before any app/db module reads process.env.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Add it to backend/.env before running integration tests.',
  );
}

if (testDatabaseUrl === databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL.');
}

const databaseName = testDatabaseUrl.split('/').pop()?.split('?')[0] ?? '';
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `TEST_DATABASE_URL must point to a database whose name ends with "_test", got "${databaseName}".`,
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.AUTH_RATE_LIMIT_MAX = '1000';
