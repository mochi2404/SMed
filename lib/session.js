const { COOKIE_NAME, verifySession } = require("./auth");

function getSession(req) {
  const token = readCookie(req.headers.cookie || "", COOKIE_NAME);
  return verifySession(token, process.env.AUTH_SECRET);
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

function readCookie(cookieHeader, name) {
  return cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

module.exports = { getSession, requireSession };
