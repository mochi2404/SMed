import { neon } from "@neondatabase/serverless";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createPasswordHash } = require("../lib/auth.js");

const databaseUrl = process.env.DATABASE_URL;
const username = process.env.AUTH_USERNAME;
const password = process.env.AUTH_PASSWORD;

if (!databaseUrl || !username || !password) {
  console.error("DATABASE_URL, AUTH_USERNAME, dan AUTH_PASSWORD wajib diisi.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const passwordHash = createPasswordHash(password);

await sql`
  create table if not exists app_users (
    id bigserial primary key,
    username text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`;

await sql`
  insert into app_users (username, password_hash)
  values (${username}, ${passwordHash})
  on conflict (username)
  do update set password_hash = excluded.password_hash, updated_at = now()
`;

console.log(`User ${username} berhasil dibuat/diperbarui.`);
