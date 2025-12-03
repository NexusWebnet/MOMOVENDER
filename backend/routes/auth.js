// backend/routes/auth.js — FULLY COMPLETE + WORKING (REGISTER + LOGIN)
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = "BANKING_SECRET_KEY"; // Put in .env later

// -------------------------
// REGISTER USER — FULLY WORKING
// -------------------------
router.post("/register", (req, res) => {
    const { first_name, last_name, email, phone, role, password } = req.body;

    if (!first_name || !last_name || !email || !phone || !role || !password) {
        return res.json({ success: false, message: "All fields are required" });
    }

    const username = last_name.toLowerCase() + phone.slice(-4);

    const sql = `INSERT INTO users (first_name, last_name, username, email, phone, role, password)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [first_name, last_name, username, email, phone, role, password], (err, result) => {
        if (err) {
            console.error("Register error:", err);
            return res.json({ success: false, message: err.sqlMessage || "User already exists" });
        }
        res.json({ success: true, message: "User registered", username });
    });
});

// -------------------------
// LOGIN + JWT TOKEN — FULLY WORKING
// -------------------------
router.post("/login", (req, res) => {
    const { emailOrUsername, password, device_info, ip_address } = req.body;

    const sql = `SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?`;

    db.query(sql, [emailOrUsername, emailOrUsername, password], (err, results) => {
        if (err) {
            console.error("DB Error:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: "Invalid credentials" });
        }

        const user = results[0];

        const token = jwt.sign(
            { id: user.id, role: user.role, branch_id: user.branch_id },
            SECRET,
            { expiresIn: "7d" }
        );

        // Log login history
        db.query(
            `INSERT INTO login_history (user_id, device_info, ip_address) VALUES (?, ?, ?)`,
            [user.id, device_info || "Unknown", ip_address || "Unknown"],
            (err) => {
                if (err) console.error("Login history failed:", err);
            }
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
    });
});

// -------------------------
// AUTH MIDDLEWARE
// -------------------------
function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = decoded;
        next();
    });
}

module.exports = { router, authenticateToken };