const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const SECRET = "BANKING_SECRET_KEY";

// JWT ADMIN MIDDLEWARE
const requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, SECRET, (err, decoded) => {
        if (err || decoded.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        req.user = decoded;
        next();
    });
};

// GET all branches
router.get('/', requireAdmin, (req, res) => {
    const sql = `
        SELECT 
            b.id,
            b.name,
            b.location,
            b.manager_id,
            u.username AS manager_name,
            CONCAT(u.first_name, ' ', u.last_name) AS manager_fullname,
            COALESCE(ac.count, 0) AS agent_count
        FROM branches b
        LEFT JOIN users u ON b.manager_id = u.id
        LEFT JOIN (
            SELECT branch_id, COUNT(*) AS count 
            FROM users 
            WHERE role = 'agent'
            GROUP BY branch_id
        ) ac ON b.id = ac.branch_id
        ORDER BY b.name
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error loading branches:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, branches: results });
    });
});

// CREATE branch
router.post('/create', requireAdmin, (req, res) => {
    const { name, location } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Branch name required' });
    }

    db.query('INSERT INTO branches (name, location) VALUES (?, ?)', [name.trim(), location || null], (err) => {
        if (err) {
            console.error('Create error:', err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, message: 'Branch created' });
    });
});

// UPDATE branch
router.put('/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, location, manager_id } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Branch name required' });
    }

    db.query('UPDATE branches SET name = ?, location = ?, manager_id = ? WHERE id = ?', 
        [name.trim(), location || null, manager_id || null, id], (err) => {
        if (err) {
            console.error('Update error:', err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, message: 'Branch updated' });
    });
});

// GET managers
router.get('/managers', requireAdmin, (req, res) => {
    const sql = `
        SELECT 
            id, 
            username, 
            CONCAT(first_name, ' ', last_name) AS fullname 
        FROM users 
        WHERE role IN ('manager', 'admin')
        ORDER BY first_name, last_name
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Managers error:', err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, managers: results });
    });
});

// GET staff
router.get('/staff', requireAdmin, (req, res) => {
    const sql = `
        SELECT 
            u.id,
            u.username,
            CONCAT(u.first_name, ' ', u.last_name) AS fullname,
            u.role,
            u.branch_id,
            b.name AS branch_name
        FROM users u
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE u.role IN ('agent', 'manager')
        ORDER BY u.first_name, u.last_name
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Staff error:', err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, staff: results });
    });
});

// ASSIGN staff
router.post('/assign-staff', requireAdmin, (req, res) => {
    const { user_id, branch_id } = req.body;
    if (!user_id) {
        return res.status(400).json({ success: false, message: 'User ID required' });
    }

    const finalBranchId = (branch_id === '' || branch_id == null) ? null : branch_id;

    db.query('UPDATE users SET branch_id = ? WHERE id = ? AND role IN ("agent", "manager")', 
        [finalBranchId, user_id], (err, result) => {
        if (err) {
            console.error('Assign error:', err);
            return res.status(500).json({ success: false });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, message: 'Staff assigned' });
    });
});


// GET branch performance analytics
router.get('/analytics', requireAdmin, (req, res) => {
    const sqlBranches = 'SELECT id, name, location FROM branches ORDER BY name';

    db.query(sqlBranches, (err, branches) => {
        if (err) {
            console.error('Analytics branches error:', err);
            return res.status(500).json({ success: false });
        }

        let totalRevenue = 0;
        let totalTransactions = 0;
        const performance = [];

        let completed = 0;
        const total = branches.length;

        if (total === 0) {
            return res.json({
                success: true,
                totalBranches: 0,
                totalRevenue: 0,
                totalTransactions: 0,
                avgRevenue: 0,
                topBranch: { name: 'N/A' },
                performance: []
            });
        }

        branches.forEach(branch => {
            const sqlStats = `
                SELECT 
                    COUNT(*) AS transactions,
                    COALESCE(SUM(amount), 0) AS revenue
                FROM momo_transactions 
                WHERE branch_id = ?
            `;

            db.query(sqlStats, [branch.id], (err, stats) => {
                if (err) console.error('Stats error for branch ' + branch.id, err);

                const revenue = parseFloat(stats[0]?.revenue || 0);
                const transactions = parseInt(stats[0]?.transactions || 0);

                // Agent count
                db.query('SELECT COUNT(*) AS count FROM users WHERE branch_id = ? AND role = "agent"', [branch.id], (err, agentRes) => {
                    const agent_count = parseInt(agentRes[0]?.count || 0);

                    // Manager name
                    db.query('SELECT username, first_name, last_name FROM users WHERE id = ?', [branch.manager_id || null], (err, managerRes) => {
                        const manager = managerRes[0] || {};
                        const manager_fullname = manager.first_name && manager.last_name ? `${manager.first_name} ${manager.last_name}` : null;
                        const manager_name = manager.username || null;

                        performance.push({
                            id: branch.id,
                            name: branch.name,
                            location: branch.location || '',
                            manager_fullname,
                            manager_name,
                            revenue,
                            transactions,
                            agent_count
                        });

                        totalRevenue += revenue;
                        totalTransactions += transactions;

                        completed++;
                        if (completed === total) {
                            performance.sort((a, b) => b.revenue - a.revenue);

                            const avgRevenue = totalRevenue / total;
                            const topBranch = performance[0] || { name: 'N/A' };

                            res.json({
                                success: true,
                                totalBranches: total,
                                totalRevenue,
                                totalTransactions,
                                avgRevenue,
                                topBranch: { name: topBranch.name },
                                performance
                            });
                        }
                    });
                });
            });
        });
    });
});

module.exports = router;