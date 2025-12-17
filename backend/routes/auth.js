// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");  // Added for secure passwords

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Promisify db.query for cleaner async/await
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// -------------------------
// REGISTER USER — SECURE WITH HASHING
// -------------------------
router.post("/register", async (req, res) => {
  const { first_name, last_name, email, phone, role, password } = req.body;

  if (!first_name || !last_name || !email || !phone || !role || !password) {
    return res.json({ success: false, message: "All fields are required" });
  }

  try {
    // Check if user already exists
    const existing = await query(
      "SELECT id FROM users WHERE email = ? OR phone = ?",
      [email, phone]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: "User already exists" });
    }

    // Generate username
    const username = last_name.toLowerCase() + phone.slice(-4);

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user
    await query(
      `INSERT INTO users (first_name, last_name, username, email, phone, role, password)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, username, email, phone, role, hashedPassword]
    );

    res.json({ success: true, message: "User registered successfully", username });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

// -------------------------
// LOGIN USER — SECURE PASSWORD CHECK
// -------------------------
router.post("/login", async (req, res) => {
  const { emailOrUsername, password, device_info, ip_address } = req.body;

  if (!emailOrUsername || !password) {
    return res.json({ success: false, message: "Username/email and password required" });
  }

  try {
    const results = await query(
      `SELECT * FROM users WHERE email = ? OR username = ?`,
      [emailOrUsername, emailOrUsername]
    );

    if (results.length === 0) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const user = results[0];

    // Compare hashed password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, branch_id: user.branch_id },
      SECRET,
      { expiresIn: "7d" }
    );

    // Log login history
    await query(
      `INSERT INTO login_history (user_id, device_info, ip_address) VALUES (?, ?, ?)`,
      [user.id, device_info || "Unknown Device", ip_address || "Unknown IP"]
    );

    res.json({
      success: true,
      token,
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------------
// AUTH MIDDLEWARE
// -------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: "Invalid or expired token" });
    }
    req.user = decoded;
    next();
  });
}

// Export
module.exports = {
  router,
  authenticateToken
};