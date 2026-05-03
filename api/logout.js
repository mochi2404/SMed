const { clearCookieHeader } = require("../lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Set-Cookie", clearCookieHeader());
  return res.status(200).json({ ok: true });
};
