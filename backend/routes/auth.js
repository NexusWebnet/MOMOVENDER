// backend/routes/auth.js — LOCALSTORAGE + LOGIN HISTORY + IP + NGROK SUPPORT

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Promisify db.query
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// REGISTER – Creates user and returns generated username
router.post("/register", async (req, res) => {
  let { first_name, last_name, email, phone, role, password } = req.body;

  first_name = first_name?.trim();
  last_name = last_name?.trim();
  email = email?.trim().toLowerCase();
  phone = phone?.trim();
  role = role?.trim().toLowerCase();
  password = password?.trim();

  if (!first_name || !last_name || !email || !phone || !role || !password) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  if (!['admin', 'manager', 'employee'].includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    const existing = await query(
      "SELECT id FROM users WHERE email = ? OR phone = ?",
      [email, phone]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "User already exists (email or phone)" });
    }

    const username = `${last_name.toLowerCase()}${phone.slice(-4)}`;
    const hashedPassword = await bcrypt.hash(password, 10);

    await query(
      `INSERT INTO users (first_name, last_name, username, email, phone, role, password, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [first_name, last_name, username, email, phone, role, hashedPassword]
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      username
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

// LOGIN – Returns token and user data (for localStorage) + IP support
router.post("/login", async (req, res) => {
  let { emailOrUsername, password, device_info } = req.body;

  emailOrUsername = emailOrUsername?.trim();
  password = password?.trim();

  if (!emailOrUsername || !password) {
    return res.status(400).json({ success: false, message: "Username/email and password required" });
  }

  try {
    const results = await query(
      `SELECT * FROM users 
       WHERE email = ? OR username = ? OR phone = ?`,
      [emailOrUsername, emailOrUsername, emailOrUsername]
    );

    if (results.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role.toLowerCase(), branch_id: user.branch_id },
      SECRET,
      { expiresIn: "7d" }
    );

    // Generate unique session ID
    const sessionId = crypto.randomBytes(16).toString('hex');

    // Get real client IP (works with Ngrok and proxies)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.socket.remoteAddress || 
                     'Unknown';

    // Log login history with real IP
    await query(
      `INSERT INTO login_history 
       (user_id, session_id, device_info, ip_address, login_time) 
       VALUES (?, ?, ?, ?, NOW())`,
      [user.id, sessionId, device_info || 'Unknown Device', clientIp]
    );

    // Set user as active
    await query(
      `UPDATE users SET is_active = 1 WHERE id = ?`,
      [user.id]
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        role: user.role.toLowerCase(),
        branch_id: user.branch_id
      },
      session_id: sessionId // For logout cleanup
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOGOUT – Delete login history record + set inactive
router.post("/logout", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const sessionId = req.body.session_id; // Sent from frontend

  if (!sessionId) {
    return res.status(400).json({ success: false, message: "Session ID required for logout" });
  }

  try {
    // Delete the specific login record
    await query(
      `DELETE FROM login_history 
       WHERE user_id = ? AND session_id = ?`,
      [userId, sessionId]
    );

    // Set user as inactive
    await query(
      `UPDATE users SET is_active = 0 WHERE id = ?`,
      [userId]
    );

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
});

// AUTH MIDDLEWARE – Bearer token from header
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  jwt.verify(token, SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ROLE AUTHORIZATION
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied' });
    next();
  };
}

module.exports = { router, authenticateToken, authorizeRoles };