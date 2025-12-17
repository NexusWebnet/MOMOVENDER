const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection
const bcrypt = require('bcryptjs');

// ✅ GET USER PROFILE DATA
router.get("/:id", (req, res) => {
    const userId = req.params.id;

    db.query(
        "SELECT id, first_name, last_name, email, phone, role FROM users WHERE id = ?",
        [userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });

            res.json(result[0]);
        }
    );
});


router.get('/profile', async (req, res) => {
  try {
    const [user] = await run('SELECT id, first_name, last_name, email, phone FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.put('/profile', async (req, res) => {
  const { first_name, last_name, phone } = req.body;
  await run(
    'UPDATE users SET first_name=?, last_name=?, phone=? WHERE id=?',
    [first_name, last_name, phone, req.user.id]
  );
  res.json({ success: true });
});

// ✅ UPDATE PROFILE
router.put("/:id", (req, res) => {
    const userId = req.params.id;
    const { first_name, last_name, email, phone } = req.body;

    db.query(
        "UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?",
        [first_name, last_name, email, phone, userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });

            res.json({ success: true, message: "Profile updated successfully." });
        }
    );
});

// ✅ CHANGE PASSWORD
router.put("/password/:id", (req, res) => {
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    // 1. Verify current password
    db.query(
        "SELECT password FROM users WHERE id = ?",
        [userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });

            if (result.length === 0)
                return res.status(404).json({ error: "User not found" });

            if (result[0].password !== currentPassword) {
                return res.status(400).json({ error: "Incorrect current password" });
            }

            // 2. Update password
            db.query(
                "UPDATE users SET password = ? WHERE id = ?",
                [newPassword, userId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2 });

                    res.json({ success: true, message: "Password changed successfully." });
                }
            );
        }
    );
});

module.exports = router;
