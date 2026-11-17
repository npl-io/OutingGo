import bcrypt from 'bcrypt';
import { pool, query } from '../src/config/db';

const ROLES = ['ADMIN', 'MODERATOR', 'USER'] as const;

const CATEGORIES = [
  { name: 'Restaurants', slug: 'restaurants', description: 'Full-service and casual dining' },
  { name: 'Cafes', slug: 'cafes', description: 'Coffee, tea, and light bites' },
  { name: 'Bars', slug: 'bars', description: 'Cocktails, beer, and wine' },
  { name: 'Shopping', slug: 'shopping', description: 'Malls, markets, and boutiques' },
  { name: 'Dessert', slug: 'dessert', description: 'Sweets, cakes, and ice cream' },
  { name: 'Fast Food', slug: 'fast-food', description: 'Quick-service restaurants' },
  { name: 'Street Food', slug: 'street-food', description: 'Street-side vendors and stalls' },
  { name: 'Bakeries', slug: 'bakeries', description: 'Bread, pastries, and sandwiches' },
  { name: 'Bubble Tea', slug: 'bubble-tea', description: 'Milk tea and boba shops' },
  { name: 'Nightlife', slug: 'nightlife', description: 'Late-night entertainment venues' },
];

type RoleName = (typeof ROLES)[number];

interface SeedUser {
  email: string;
  password: string;
  fullName: string;
  role: RoleName;
}

function buildSeedUsers(): SeedUser[] {
  const users: SeedUser[] = [
    { email: 'admin@test.com', password: 'Admin123!', fullName: 'Admin User', role: 'ADMIN' },
    {
      email: 'moderator@test.com',
      password: 'Moderator123!',
      fullName: 'Moderator User',
      role: 'MODERATOR',
    },
  ];

  for (let i = 1; i <= 10; i += 1) {
    users.push({
      email: `user${i}@test.com`,
      password: 'User123!',
      fullName: `User ${i}`,
      role: 'USER',
    });
  }

  return users;
}

async function seed(): Promise<void> {
  for (const role of ROLES) {
    await query('INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [role]);
  }

  for (const category of CATEGORIES) {
    await query(
      'INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
      [category.name, category.slug, category.description],
    );
  }

  for (const user of buildSeedUsers()) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await query(
      `INSERT INTO users (email, password_hash, full_name, role_id)
       SELECT $1, $2, $3, id FROM roles WHERE name = $4
       ON CONFLICT (email) DO NOTHING`,
      [user.email.toLowerCase(), passwordHash, user.fullName, user.role],
    );
  }

  const [roleCount, categoryCount, userCount] = await Promise.all([
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM roles'),
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM categories'),
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users'),
  ]);

  console.log(
    `Seed complete: ${roleCount.rows[0]?.count ?? 0} roles, ` +
      `${categoryCount.rows[0]?.count ?? 0} categories, ${userCount.rows[0]?.count ?? 0} users`,
  );
}

async function main(): Promise<void> {
  try {
    await seed();
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
