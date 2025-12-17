(() => {
  'use strict';

  const sidebar = document.getElementById('sidebar');
  const hamburger = document.querySelector('.hamburger');
  const closeBtn = document.getElementById('closeMenu');
  const welcomeTextEl = document.getElementById('welcomeText');
  const transactionBody = document.getElementById('transactionBody');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // Welcome message
  if (welcomeTextEl) {
    welcomeTextEl.textContent = `Welcome, ${user.first_name || 'Agent'}!`;
  }

  // Toggle Sidebar
  window.toggleSidebar = () => sidebar?.classList.toggle('active');
  hamburger?.addEventListener('click', toggleSidebar);
  closeBtn?.addEventListener('click', toggleSidebar);

  document.addEventListener('click', (e) => {
    if (!sidebar?.classList.contains('active')) return;
    if (sidebar.contains(e.target) || hamburger?.contains(e.target)) return;
    if (window.innerWidth <= 1024) toggleSidebar();
  });

  window.navigate = (page) => location.href = page + '.html';

  // COMMISSION RATE
  const COMMISSION_RATE = 0.002; // 0.2%

  // Load Dashboard Stats + Commission
  async function loadDashboard() {
    if (!user.id || !token) return;

    try {
      const res = await fetch('http://localhost:8000/records/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();

      // Update stats
      document.getElementById('totalToday').textContent = `GHC ${(data.today?.total || 0).toFixed(2)}`;
      document.getElementById('momoToday').textContent = (data.today?.momo || 0);
      document.getElementById('bankToday').textContent = (data.today?.bank || 0);
      document.getElementById('totalRecords').textContent = (data.today?.transactions || 0);

      // COMMISSION TODAY
      const totalAmount = data.today?.total || 0;
      const commissionToday = totalAmount * COMMISSION_RATE;
      const commissionEl = document.getElementById('commissionToday');
      if (commissionEl) {
        commissionEl.textContent = `GHC ${commissionToday.toFixed(2)}`;
      } else {
        // Auto-create if not in HTML
        let el = document.querySelector('#commissionToday');
        if (!el) {
          const stats = document.querySelector('.stats-grid');
          if (stats) {
            stats.insertAdjacentHTML('beforeend', `
              <div class="stat-card commission">
                <h3>Commission Today</h3>
                <p id="commissionToday">GHC ${commissionToday.toFixed(2)}</p>
              </div>
            `);
          }
        }
      }
    } catch (err) {
      console.log('Dashboard load failed:', err);
    }
  }

  // Load Recent Transactions (Last 24 Hours Only + Newest First)
  async function loadTransactions() {
    if (!transactionBody || !token) return;

    try {
      const res = await fetch('http://localhost:8000/records/records?limit=50', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed');

      let { records } = await res.json();

      // Filter: Only last 24 hours
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      records = records.filter(r => new Date(r.created_at) > oneDayAgo);

      // Sort: Newest first
      records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (!records.length) {
        transactionBody.innerHTML = '<div class="table-row"><span>No transactions in last 24 hours</span></div>';
        return;
      }

      transactionBody.innerHTML = records.map(r => {
        const commission = (r.amount * COMMISSION_RATE).toFixed(2);
        const type = r.type.replace('_', ' ').toUpperCase();

        return `
          <div class="table-row">
            <span>${r.customer_name || r.customer_phone || 'Customer'}</span>
            <span class="type-badge ${r.type}">${type}</span>
            <span class="amount">GHC ${Number(r.amount).toFixed(2)}</span>
            <span class="commission">+GHC ${commission}</span>
            <span class="time">${new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.log('Transactions load failed:', err);
      transactionBody.innerHTML = '<div class="table-row error"><span>Error loading records</span></div>';
    }
  }

  // Search functionality
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    [...transactionBody?.children || []].forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });

  // Socket.IO real-time updates
  const socket = io('http://localhost:8000');
  socket.on('connect', () => {
    if (user.id) socket.emit('joinAgent', user.id);
  });

  socket.on('newTransaction', () => {
    loadDashboard();
    loadTransactions();
  });

  socket.on('newRecord', () => {
    loadDashboard();
    loadTransactions();
  });

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    loadTransactions();

    // Auto-refresh every 30 seconds
    setInterval(() => {
      loadDashboard();
      loadTransactions();
    }, 30000);
  });

})();