// src/adminAuth.js
'use strict';

// Simple bearer-token check for admin-only routes. Set ADMIN_KEY in
// Render's environment variables to a long random string, then the
// admin panel sends it as: Authorization: Bearer <ADMIN_KEY>
function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    // Fail closed, not open — an unset ADMIN_KEY must never mean "no auth required".
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_KEY not set.' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

module.exports = { adminAuth };
