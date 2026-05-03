const crypto = require("crypto");

const COOKIE_NAME = "sms_session";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signSession(payload, secret) {
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const incoming = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (incoming.length !== expectedBuffer.length || !crypto.timingSafeEqual(incoming, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(username, secret) {
  const now = Math.floor(Date.now() / 1000);
  return signSession({ username, iat: now, exp: now + TOKEN_MAX_AGE }, secret);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt:")) return false;
  const [, salt, hash] = storedHash.split(":");
  const incoming = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "base64url");
  return expected.length === incoming.length && crypto.timingSafeEqual(expected, incoming);
}

function getCookieHeader(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TOKEN_MAX_AGE}`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  COOKIE_NAME,
  TOKEN_MAX_AGE,
  createSession,
  verifySession,
  createPasswordHash,
  verifyPassword,
  getCookieHeader,
  clearCookieHeader,
};
