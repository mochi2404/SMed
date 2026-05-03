const { neon } = require("@neondatabase/serverless");
const { createPasswordHash, createSession, getCookieHeader, verifyPassword } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const databaseUrl = process.env.DATABASE_URL;
  const authSecret = process.env.AUTH_SECRET;

  if (!databaseUrl || !authSecret) {
    return res.status(500).json({ error: "Auth environment is not configured" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  }

  const sql = neon(databaseUrl);
  await ensureUsersTable(sql);
  await bootstrapUserFromEnv(sql);

  const rows = await sql`
    select username, password_hash
    from app_users
    where username = ${username}
    limit 1
  `;

  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Username atau password salah" });
  }

  const token = createSession(user.username, authSecret);
  res.setHeader("Set-Cookie", getCookieHeader(token));
  return res.status(200).json({ ok: true });
};

async function ensureUsersTable(sql) {
  await sql`
    create table if not exists app_users (
      id bigserial primary key,
      username text unique not null,
      password_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
}

async function bootstrapUserFromEnv(sql) {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  if (!username || !password) return;

  const rows = await sql`
    select username
    from app_users
    where username = ${username}
    limit 1
  `;

  if (rows.length) return;

  await sql`
    insert into app_users (username, password_hash)
    values (${username}, ${createPasswordHash(password)})
  `;
}
