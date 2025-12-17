const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection
const bcrypt = require('bcryptjs');

router.get("/", (req, res) => {
    db.query("SELECT id, first_name, role FROM users", (err, results) => {
        if (err) return res.json({ success: false, error: err });

        res.json(results);
    });
});

module.exports = router;
