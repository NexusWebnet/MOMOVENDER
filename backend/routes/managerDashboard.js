// backend/routes/managerDashboard.js — MANAGER-ONLY BRANCH DATA + CHART DATA
const express = require("express");
const router = express.Router();
const db = require("../config/db");

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

router.get('/', async (req, res) => {
  try {
    if (!req.user || !['manager', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const managerId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // Get manager details + branch
    const [manager] = await query("SELECT first_name, last_name, branch_id FROM users WHERE id = ?", [managerId]);
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const branchId = manager.branch_id;
    const managerName = `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || 'Manager';

    if (!branchId && req.user.role !== 'admin') {
      return res.status(400).json({ success: false, error: "No branch assigned" });
    }

    // Strict branch filter
    const branchFilter = req.user.role === 'admin' ? '' : 'AND u.branch_id = ?';
    const branchParams = req.user.role === 'admin' ? [] : [branchId];

    // 1. Today's Volume
    const [volume] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM momo_transactions mt JOIN users u ON mt.agent_id = u.id WHERE DATE(mt.created_at) = ? ${branchFilter}
        UNION ALL SELECT amount FROM bank_transactions bt JOIN users u ON bt.agent_id = u.id WHERE DATE(bt.created_at) = ? ${branchFilter}
        UNION ALL SELECT amount FROM airtime_logs al JOIN users u ON al.employee_id = u.id WHERE DATE(al.created_at) = ? ${branchFilter}
        UNION ALL SELECT amount FROM sim_sales ss JOIN users u ON ss.employee_id = u.id WHERE DATE(ss.created_at) = ? ${branchFilter}
        UNION ALL SELECT amount FROM susu_contributions sc JOIN users u ON sc.agent_id = u.id WHERE DATE(sc.created_at) = ? ${branchFilter}
      ) AS txns
    `, [today, ...branchParams, today, ...branchParams, today, ...branchParams, today, ...branchParams, today, ...branchParams]);

    // 2. Active Agents Today
    const [active] = await query(`
      SELECT COUNT(DISTINCT agent_id) AS count FROM (
        SELECT mt.agent_id FROM momo_transactions mt JOIN users u ON mt.agent_id = u.id WHERE DATE(mt.created_at) = ? ${branchFilter}
        UNION SELECT bt.agent_id FROM bank_transactions bt JOIN users u ON bt.agent_id = u.id WHERE DATE(bt.created_at) = ? ${branchFilter}
        UNION SELECT al.employee_id FROM airtime_logs al JOIN users u ON al.employee_id = u.id WHERE DATE(al.created_at) = ? ${branchFilter}
        UNION SELECT ss.employee_id FROM sim_sales ss JOIN users u ON ss.employee_id = u.id WHERE DATE(ss.created_at) = ? ${branchFilter}
        UNION SELECT sc.agent_id FROM susu_contributions sc JOIN users u ON sc.agent_id = u.id WHERE DATE(sc.created_at) = ? ${branchFilter}
      ) AS agents
    `, [today, ...branchParams, today, ...branchParams, today, ...branchParams, today, ...branchParams, today, ...branchParams]);

    // 3. Pending Float Requests
    const [pending] = await query(`SELECT COUNT(*) AS count FROM float_requests fr JOIN users u ON fr.agent_id = u.id WHERE fr.status = 'pending' ${branchFilter}`, branchParams);

    // 4. Total Approved Float
    const [floatBal] = await query(`SELECT COALESCE(SUM(amount), 0) AS total FROM float_requests fr JOIN users u ON fr.agent_id = u.id WHERE fr.status = 'approved' ${branchFilter}`, branchParams);

    // 5. Weekly Chart Data (Last 7 days)
    const weekData = await query(`
      SELECT DATE(created_at) AS date, COALESCE(SUM(amount), 0) AS total FROM (
        SELECT created_at, amount FROM momo_transactions mt JOIN users u ON mt.agent_id = u.id WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${branchFilter}
        UNION ALL SELECT created_at, amount FROM bank_transactions bt JOIN users u ON bt.agent_id = u.id WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${branchFilter}
        UNION ALL SELECT created_at, amount FROM airtime_logs al JOIN users u ON al.employee_id = u.id WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${branchFilter}
        UNION ALL SELECT created_at, amount FROM sim_sales ss JOIN users u ON ss.employee_id = u.id WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${branchFilter}
        UNION ALL SELECT created_at, amount FROM susu_contributions sc JOIN users u ON sc.agent_id = u.id WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${branchFilter}
      ) AS txns GROUP BY DATE(created_at) ORDER BY date
    `, branchParams);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekLabels = [];
    const weekValues = [];
    const todayDate = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      weekLabels.push(days[d.getDay()]);
      const found = weekData.find(row => row.date === dateStr);
      weekValues.push(parseFloat(found?.total || 0));
    }

    // 6. Recent Activity
    const recent = await query(`
      SELECT 'MoMo' AS service, amount, type, network, created_at, CONCAT(u.first_name, ' ', u.last_name) AS name
      FROM momo_transactions mt JOIN users u ON mt.agent_id = u.id WHERE DATE(created_at) = ? ${branchFilter}
      UNION ALL SELECT 'Bank', amount, type, bank_name, created_at, CONCAT(u.first_name, ' ', u.last_name)
      FROM bank_transactions bt JOIN users u ON bt.agent_id = u.id WHERE DATE(created_at) = ? ${branchFilter}
      UNION ALL SELECT 'Airtime', amount, 'topup', network, created_at, CONCAT(u.first_name, ' ', u.last_name)
      FROM airtime_logs al JOIN users u ON al.employee_id = u.id WHERE DATE(created_at) = ? ${branchFilter}
      ORDER BY created_at DESC LIMIT 10
    `, [today, ...branchParams, today, ...branchParams, today, ...branchParams]);

    const recent_activity = recent.map(r => ({
      name: r.name || 'Agent',
      action: r.type === 'deposit' ? 'received deposit' : r.type === 'withdraw' ? 'sent withdrawal' : 'sold ' + r.service.toLowerCase(),
      amount: parseFloat(r.amount).toFixed(2),
      network: r.network || ''
    }));

    res.json({
      success: true,
      data: {
        daily_transactions: parseFloat(volume[0].total || 0),
        active_agents: parseInt(active[0].count || 0),
        pending_withdrawals: parseInt(pending[0].count || 0),
        total_float: parseFloat(floatBal[0].total || 0),
        managerName,
        recent_activity,
        chart: {
          weekly: { labels: weekLabels, data: weekValues }
        }
      }
    });

  } catch (err) {
    console.error("Manager Dashboard Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;