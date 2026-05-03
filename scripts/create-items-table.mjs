import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL wajib diisi.");
  process.exit(1);
}

const sql = neon(databaseUrl);

await sql`
  create table if not exists app_items (
    id text primary key,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`;

console.log("Table app_items siap.");
