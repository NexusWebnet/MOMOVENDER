// backend/routes/profile.js — FINAL FIXED & WORKING

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        console.error('SQL ERROR:', err);
        return reject(err);
      }
      resolve(results || []);
    });
  });

// GET PROFILE — FIXED: Safe join, all fields
router.get('/', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const [rows] = await run(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.phone,
        u.role,
        u.created_at,
        COALESCE(b.name, 'No Branch') AS branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || 'employee',
        branch_name: user.branch_name,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Profile GET error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// UPDATE PROFILE
router.put('/', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false });
    }

    const { first_name, last_name, phone } = req.body;

    await run(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?',
      [first_name || null, last_name || null, phone || null, req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Profile UPDATE error:', err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// CHANGE PASSWORD — FIXED: Uses bcrypt
router.put('/password', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password too short' });
    }

    // Get current hashed password
    const [rows] = await run('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false });

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);

    await run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;