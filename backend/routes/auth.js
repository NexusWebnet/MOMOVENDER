// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ✅ REGISTER USER
router.post("/register", (req, res) => {
    const { first_name, last_name, email, phone, role, password } = req.body;

    const username = last_name.toLowerCase() + phone.slice(-4); // auto-generate username

    const sql = `INSERT INTO users (first_name, last_name, username, email, phone, role, password)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [first_name, last_name, username, email, phone, role, password], (err, result) => {
        if (err) return res.json({ success: false, message: err.sqlMessage });

        res.json({ success: true, username });
    });
});

// ✅ LOGIN USER + record login history
router.post("/login", (req, res) => {
    const { emailOrUsername, password, device_info, ip_address } = req.body;

    const sql = `SELECT * FROM users WHERE (email=? OR username=?) AND password=?`;

    db.query(sql, [emailOrUsername, emailOrUsername, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.sqlMessage });

        if (results.length === 0) {
            return res.json({ success: false, message: "Invalid login credentials" });
        }

        const user = results[0];

        // Record login history
        const historySql = `INSERT INTO login_history (user_id, device_info, ip_address) VALUES (?, ?, ?)`;
        db.query(historySql, [user.id, device_info || "Unknown", ip_address || "Unknown"], (err2) => {
            if (err2) console.error("Login history error:", err2.sqlMessage);
        });

        res.json({
            success: true,
            role: user.role,
            first_name: user.first_name,
            last_name: user.last_name,
            username: user.username
        });
    });
});

module.exports = router;
