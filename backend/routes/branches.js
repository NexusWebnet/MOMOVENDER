// backend/routes/branches.js — FULL CRUD + STAFF ASSIGNMENT + ANALYTICS

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require('./auth');

// Flexible admin check
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

  const role = (req.user.role || '').toString().toLowerCase().trim();
  if (['admin', 'owner', 'superadmin', 'queen'].includes(role)) return next();

  return res.status(403).json({ success: false, message: 'Admin access required' });
};

// Apply authentication and admin check
router.use(authenticateToken, requireAdmin);

// Promise-based query helper
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
  });

/* ============================
   CRUD: Branches
============================ */

// GET all branches
router.get('/', async (req, res) => {
  try {
    const branches = await query(`
      SELECT 
        b.id,
        b.name,
        b.location,
        b.manager_id,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS manager_fullname,
        COALESCE(u.username, '') AS manager_name,
        COALESCE(ac.count, 0) AS agent_count
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      LEFT JOIN (
        SELECT branch_id, COUNT(*) AS count 
        FROM users 
        WHERE role IN ('employee', 'manager')
        GROUP BY branch_id
      ) ac ON b.id = ac.branch_id
      ORDER BY b.name
    `);
    res.json({ success: true, branches });
  } catch (err) {
    console.error('Error loading branches:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// CREATE branch
router.post('/', async (req, res) => {
  const { name, location } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: 'Branch name required' });

  try {
    const result = await query(
      'INSERT INTO branches (name, location) VALUES (?, ?)',
      [name.trim(), location?.trim() || null]
    );
    res.json({ success: true, message: 'Branch created successfully', branchId: result.insertId });
  } catch (err) {
    console.error('Create branch error:', err);
    res.status(500).json({ success: false, message: 'Failed to create branch' });
  }
});

// UPDATE branch
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location, manager_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: 'Branch name required' });

  try {
    await query(
      'UPDATE branches SET name = ?, location = ?, manager_id = ? WHERE id = ?',
      [name.trim(), location?.trim() || null, manager_id || null, id]
    );
    res.json({ success: true, message: 'Branch updated successfully' });
  } catch (err) {
    console.error('Update branch error:', err);
    res.status(500).json({ success: false, message: 'Failed to update branch' });
  }
});

// DELETE branch
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM branches WHERE id = ?', [id]);
    res.json({ success: true, message: 'Branch deleted successfully' });
  } catch (err) {
    console.error('Delete branch error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete branch' });
  }
});

/* ============================
   Staff & Managers
============================ */

// GET all managers (for dropdown)
router.get('/managers', async (req, res) => {
  try {
    const managers = await query(`
      SELECT 
        id,
        username,
        CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS fullname
      FROM users 
      WHERE role IN ('manager', 'admin')
      ORDER BY first_name, last_name
    `);
    res.json({ success: true, managers });
  } catch (err) {
    console.error('Managers fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch managers' });
  }
});

// GET all staff (employees + managers)
router.get('/staff', async (req, res) => {
  try {
    const staff = await query(`
      SELECT 
        u.id,
        u.username,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS fullname,
        u.role,
        u.branch_id,
        b.name AS branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.role IN ('employee', 'manager')
      ORDER BY u.first_name, u.last_name
    `);
    res.json({ success: true, staff });
  } catch (err) {
    console.error('Staff fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch staff' });
  }
});

// ASSIGN staff/manager to branch
router.post('/assign-staff', async (req, res) => {
  const { user_id, branch_id } = req.body;
  if (!user_id) return res.status(400).json({ success: false, message: 'User ID required' });

  const finalBranchId = branch_id || null;

  try {
    const result = await query(
      'UPDATE users SET branch_id = ? WHERE id = ? AND role IN ("employee", "manager")',
      [finalBranchId, user_id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'User not found or invalid role' });

    res.json({ success: true, message: 'Staff assigned successfully' });
  } catch (err) {
    console.error('Assign staff error:', err);
    res.status(500).json({ success: false, message: 'Failed to assign staff' });
  }
});

/* ============================
   Analytics (Branch Performance)
============================ */

router.get('/analytics', async (req, res) => {
  const range = req.query.range || 'month';
  let start, end;
  const now = new Date();

  try {
    // Calculate date range
    if (range === 'today') {
      start = end = now.toISOString().slice(0, 10);
    } else if (range === 'week') {
      start = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().slice(0, 10);
      end = new Date().toISOString().slice(0, 10);
    } else if (range === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      end = new Date().toISOString().slice(0, 10);
    } else {
      start = '1970-01-01';
      end = new Date().toISOString().slice(0, 10);
    }

    // Branches with agent count + revenue
    const branches = await query(`
      SELECT 
        b.id,
        b.name,
        b.location,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS manager_fullname,
        COALESCE(u.username, '') AS manager_name,
        COALESCE(ac.agent_count, 0) AS agent_count,
        COALESCE(SUM(bt.amount), 0) AS revenue,
        COALESCE(COUNT(bt.id), 0) AS transactions
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      LEFT JOIN (
        SELECT branch_id, COUNT(*) AS agent_count 
        FROM users 
        WHERE role IN ('employee', 'manager')
        GROUP BY branch_id
      ) ac ON b.id = ac.branch_id
      LEFT JOIN bank_transactions bt ON bt.agent_id IN (
        SELECT id FROM users WHERE branch_id = b.id
      ) AND DATE(bt.created_at) BETWEEN ? AND ?
      GROUP BY b.id
      ORDER BY b.name
    `, [start, end]);

    // Global totals
    const totals = await query(`
      SELECT 
        COUNT(DISTINCT b.id) AS total_branches,
        SUM(bt.amount) AS total_revenue,
        COUNT(bt.id) AS total_transactions
      FROM branches b
      LEFT JOIN bank_transactions bt ON bt.agent_id IN (
        SELECT id FROM users WHERE branch_id = b.id
      ) AND DATE(bt.created_at) BETWEEN ? AND ?
    `, [start, end]);

    const totalBranches = totals[0]?.total_branches || 0;
    const totalRevenue = totals[0]?.total_revenue || 0;
    const totalTransactions = totals[0]?.total_transactions || 0;
    const avgRevenue = totalBranches ? totalRevenue / totalBranches : 0;
    const topBranch = branches.reduce((max, b) => (b.revenue > max.revenue ? b : max), { name: 'N/A', revenue: 0 });

    res.json({
      success: true,
      totalBranches,
      totalRevenue,
      totalTransactions,
      avgRevenue,
      topBranch: { name: topBranch.name, revenue: topBranch.revenue },
      performance: branches.map(b => ({
        ...b,
        revenue: b.revenue || 0,
        transactions: b.transactions || 0
      }))
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

module.exports = router;