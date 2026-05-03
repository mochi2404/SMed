const fs = require("fs/promises");
const path = require("path");
const { COOKIE_NAME, verifySession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  const token = readCookie(req.headers.cookie || "", COOKIE_NAME);
  const session = verifySession(token, process.env.AUTH_SECRET);

  if (!session) {
    res.statusCode = 302;
    res.setHeader("Location", "/login.html");
    return res.end();
  }

  const html = await fs.readFile(path.join(process.cwd(), "index.html"), "utf8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
};

function readCookie(cookieHeader, name) {
  return cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
