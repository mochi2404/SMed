const { neon } = require("@neondatabase/serverless");
const { requireSession } = require("../lib/session");

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ error: "DATABASE_URL belum diset" });
  }

  const sql = neon(databaseUrl);
  await ensureTable(sql);

  if (req.method === "GET") {
    const rows = await sql`select data from app_items order by updated_at desc`;
    return res.status(200).json({ items: rows.map((row) => row.data) });
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const item = body.item;
    if (!item?.id) return res.status(400).json({ error: "Item id wajib ada" });
    await sql`
      insert into app_items (id, data)
      values (${item.id}, ${JSON.stringify(item)})
      on conflict (id)
      do update set data = excluded.data, updated_at = now()
    `;
    return res.status(200).json({ item });
  }

  if (req.method === "PUT") {
    const body = parseBody(req);
    const item = body.item;
    if (!item?.id) return res.status(400).json({ error: "Item id wajib ada" });
    await sql`update app_items set data = ${JSON.stringify(item)}, updated_at = now() where id = ${item.id}`;
    return res.status(200).json({ item });
  }

  if (req.method === "DELETE") {
    const body = parseBody(req);
    const id = body.id;
    if (!id) return res.status(400).json({ error: "Item id wajib ada" });
    await sql`delete from app_items where id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET,POST,PUT,DELETE");
  return res.status(405).json({ error: "Method not allowed" });
};

async function ensureTable(sql) {
  await sql`
    create table if not exists app_items (
      id text primary key,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
}

function parseBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
}
