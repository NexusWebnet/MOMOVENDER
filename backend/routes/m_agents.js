const express = require("express");
const router = express.Router();
const db = require("../config/db"); // MySQL connection
const authenticateToken = require("./auth").authenticateToken;

// FULL AGENTS + PERFORMANCE DASHBOARD DATA
router.get('/manager-agents-full', authenticateToken, async (req, res) => {
  if (!['manager', 'admin'].includes(req.user.role)) {
    return res.sendStatus(403); // forbidden
  }

  try {
    // 🌍 1. Get manager's branch
    const [branchRows] = await db.query(`
      SELECT b.id, b.name, b.location 
      FROM branches b 
      JOIN users u ON u.branch_id = b.id 
      WHERE u.id = ?
    `, [req.user.id]);

    const branch = branchRows[0];

    if (!branch) {
      return res.status(400).json({ error: 'No branch assigned' });
    }

    // 👥 2. All agents under that branch + today's sales
    const [agents] = await db.query(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.username, 
        u.phone, 
        u.status,
        COALESCE(ads.momo_volume + ads.bank_volume, 0) AS today_sales
      FROM users u
      LEFT JOIN agent_daily_sales ads 
        ON ads.agent_id = u.id 
       AND ads.sale_date = CURDATE()
      WHERE u.branch_id = ? 
        AND u.role = 'employee'
      ORDER BY today_sales DESC
    `, [branch.id]);

    // 🏆 3. Top 5 agents this week
    const [topThisWeek] = await db.query(`
      SELECT 
        CONCAT(u.first_name, ' ', LEFT(u.last_name, 1), '.') AS name,
        COALESCE(SUM(ads.momo_volume + ads.bank_volume), 0) AS total
      FROM agent_daily_sales ads
      JOIN users u ON u.id = ads.agent_id
      WHERE ads.sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND u.branch_id = ?
      GROUP BY ads.agent_id
      ORDER BY total DESC 
      LIMIT 5
    `, [branch.id]);

    // 📈 4. Sales trend for the last 7 days
    const [salesTrend] = await db.query(`
      SELECT 
        DATE(ads.sale_date) AS date,
        COALESCE(SUM(ads.momo_volume + ads.bank_volume), 0) AS total
      FROM agent_daily_sales ads
      WHERE ads.sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND EXISTS (
          SELECT 1 
          FROM users u 
          WHERE u.id = ads.agent_id 
            AND u.branch_id = ?
        )
      GROUP BY DATE(ads.sale_date)
      ORDER BY date
    `, [branch.id]);

    // ✅ FINAL RESULT
    res.json({
      branch,
      agents,
      topThisWeek,
      salesTrend
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
