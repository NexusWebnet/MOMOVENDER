// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const SECRET = "BANKING_SECRET_KEY"; // You can move this to .env later

// -------------------------
// REGISTER USER
// -------------------------
router.post("/register", (req, res) => {
    const { first_name, last_name, email, phone, role, password } = req.body;

    const username = last_name.toLowerCase() + phone.slice(-4);

    const sql = `INSERT INTO users (first_name, last_name, username, email, phone, role, password)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [first_name, last_name, username, email, phone, role, password], (err, result) => {
        if (err) return res.json({ success: false, message: err.sqlMessage });

        res.json({ success: true, username });
    });
});


// -------------------------
// LOGIN + JWT TOKEN
// -------------------------
router.post("/login", (req, res) => {
    const { emailOrUsername, password, device_info, ip_address } = req.body;

    const sql = `SELECT * FROM users WHERE (email=? OR username=?) AND password=?`;

    db.query(sql, [emailOrUsername, emailOrUsername, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.sqlMessage });

        if (results.length === 0) {
            return res.json({ success: false, message: "Invalid login credentials" });
        }

        const user = results[0];

        // Generate a JWT token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            SECRET,
            { expiresIn: "7d" }
        );

        // Login history
        const historySql = `INSERT INTO login_history (user_id, device_info, ip_address) VALUES (?, ?, ?)`;
        db.query(historySql, [user.id, device_info || "Unknown", ip_address || "Unknown"]);

        res.json({
            success: true,
            token,
            role: user.role,
            first_name: user.first_name,
            last_name: user.last_name,
            username: user.username
        });
    });
});


// -------------------------
// AUTH MIDDLEWARE
// -------------------------
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.sendStatus(403);

        req.user = user; // Attach decoded user data
        next();
    });
}


// -------------------------
// EXPORT ROUTER + MIDDLEWARE
// -------------------------
module.exports = {
    router,
    authenticateToken
};
