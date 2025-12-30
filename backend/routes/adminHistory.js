// backend/routes/adminHistory.js — FULL TOTAL HISTORY LOG FOR ADMIN

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback_secret';

/* AUTH */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'owner', 'superadmin', 'queen'].includes((req.user.role || '').toLowerCase().trim())) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.use(authenticateToken, requireAdmin);
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

/* DB HELPER */
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

/* GET /api/admin/history — Full Activity Log */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let start = req.query.start || '1970-01-01';
    let end = req.query.end || new Date().toISOString().split('T')[0];
    const agentId = req.query.agent || '';
    const typeFilter = req.query.type || '';

    let whereConditions = [`DATE(timestamp) BETWEEN ? AND ?`];
    let params = [start, end];

    if (agentId) {
      whereConditions.push(`user_id = ?`);
      params.push(agentId);
    }

    if (typeFilter) {
      const validTypes = ['login', 'logout', 'momo', 'bank', 'airtime', 'sim', 'susu'];
      if (validTypes.includes(typeFilter)) {
        whereConditions.push(`activity_type = ?`);
        params.push(typeFilter);
      }
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const historySql = `
      SELECT 
        timestamp,
        user_id,
        CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS agent_name,
        activity_type AS type,
        action,
        details,
        amount
      FROM (
        -- Login/Logout from login_history
        SELECT 
          login_time AS timestamp,
          user_id,
          'login' AS activity_type,
          'Login' AS action,
          CONCAT('Device: ', device_info, ' | IP: ', ip_address) AS details,
          NULL AS amount
        FROM login_history
        UNION ALL
        -- MoMo Transactions
        SELECT 
          created_at AS timestamp,
          agent_id AS user_id,
          'momo' AS activity_type,
          CONCAT(UPPER(type), ' MoMo') AS action,
          CONCAT('Customer: ', customer_name, ' | Ref: ', momo_reference) AS details,
          amount
        FROM momo_transactions
        UNION ALL
        -- Bank Transactions
        SELECT 
          created_at AS timestamp,
          agent_id AS user_id,
          'bank' AS activity_type,
          CONCAT(UPPER(type), ' Bank') AS action,
          CONCAT('Customer: ', customer_name) AS details,
          amount
        FROM bank_transactions
        UNION ALL
        -- Airtime Logs
        SELECT 
          created_at AS timestamp,
          employee_id AS user_id,
          'airtime' AS activity_type,
          'Airtime Topup' AS action,
          CONCAT('Customer: ', customer_name, ' | Network: ', network) AS details,
          amount
        FROM airtime_logs
        UNION ALL
        -- SIM Sales
        SELECT 
          created_at AS timestamp,
          employee_id AS user_id,
          'sim' AS activity_type,
          'SIM Registration/Sale' AS action,
          CONCAT('Customer: ', customer_name) AS details,
          amount
        FROM sim_sales
        UNION ALL
        -- Susu Contributions
        SELECT 
          created_at AS timestamp,
          agent_id AS user_id,
          'susu' AS activity_type,
          'Susu Contribution' AS action,
          CONCAT('Customer: ', customer_name) AS details,
          amount
        FROM susu_contributions
      ) logs
      JOIN users u ON logs.user_id = u.id
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const history = await run(historySql, params);

    res.json({
      success: true,
      history: history.map(h => ({
        timestamp: h.timestamp,
        agent_name: h.agent_name.trim() || 'Unknown Agent',
        action: h.action,
        details: h.details || '',
        amount: h.amount ? Number(h.amount) : null,
        type: h.type
      }))
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
