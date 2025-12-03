/* FINAL index.js — Updated & Fixed — Dec 2025 */
(() => {
  'use strict';

  const sidebar       = document.getElementById("sidebar");
  const hamburger     = document.getElementById("openMenu");
  const closeBtn      = document.getElementById("closeMenu");
  const welcomeTextEl = document.getElementById("welcomeText");
  const transactionBody = document.getElementById("transactionBody");

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // ============================
  // WELCOME TEXT
  // ============================
  if (welcomeTextEl) {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Agent';
    welcomeTextEl.textContent = `Welcome, ${name}!`;
  }

  // ============================
  // SIDEBAR TOGGLE (FULL FIX)
  // ============================
  window.toggleSidebar = () => {
    sidebar?.classList.toggle("active");
    document.body.classList.toggle("sidebar-open");
  };

  // OPEN
  hamburger?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  // CLOSE BUTTON
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  // CLICK OUTSIDE TO CLOSE (MOBILE ONLY)
  document.addEventListener("click", (e) => {
    if (!sidebar?.classList.contains("active")) return;
    if (sidebar.contains(e.target)) return;
    if (hamburger?.contains(e.target)) return;
    if (window.innerWidth > 1024) return; // Desktop remains static
    toggleSidebar();
  });

  // ESC KEY CLOSE
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar?.classList.contains("active")) {
      toggleSidebar();
    }
  });

  // ============================
  // NAVIGATION
  // ============================
  window.navigate = (page) => {
    location.href = page + ".html";
  };

  // ============================
  // AUTH HEADERS
  // ============================
  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // ============================
  // DASHBOARD API LOADER
  // ============================
  async function loadDashboard() {
    if (!user.id) return;

    try {
      const res = await fetch(
        `http://localhost:8000/api/dashboard/today/${user.id}`,
        { headers: getAuthHeaders() }
      );

      if (!res.ok) return;

      const d = await res.json();

      // FIXED: you used .then() on an element (bug)
      const totalEl = document.getElementById("totalToday");
      const momoEl  = document.getElementById("momoToday");
      const bankEl  = document.getElementById("bankToday");
      const simEl   = document.getElementById("simToday");

      if (totalEl) totalEl.textContent = `GHC ${Number(d.total || 0).toFixed(2)}`;
      if (momoEl)  momoEl.textContent  = `GHC ${Number(d.momo || 0).toFixed(2)}`;
      if (bankEl)  bankEl.textContent  = `GHC ${Number(d.bank || 0).toFixed(2)}`;
      if (simEl)   simEl.textContent   = d.sim || 0;

    } catch (err) {
      console.log("Dashboard offline", err);
    }
  }

  // ============================
  // TRANSACTIONS LOADER
  // ============================
  async function loadTransactions() {
    if (!transactionBody) return;

    transactionBody.innerHTML = `
      <div class="table-row"><span>Loading transactions...</span></div>
    `;

    if (!user.id) {
      transactionBody.innerHTML = `
        <div class="table-row error"><span>Please log in</span></div>
      `;
      return;
    }

    const role = (user.role || "").toLowerCase();
    const branchId = user.branch_id;

    let url = "";

    if (role === "admin") {
      url = "http://localhost:8000/api/transactions/all";
    } else if (role === "manager" || role === "employee") {
      if (!branchId) {
        transactionBody.innerHTML = `
          <div class="table-row error"><span>No branch assigned</span></div>
        `;
        return;
      }
      url = `http://localhost:8000/api/transactions/branch/${branchId}`;
    } else {
      transactionBody.innerHTML = `
        <div class="table-row error"><span>Access denied</span></div>
      `;
      return;
    }

    try {
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const transactions = await res.json();

      if (!transactions.length) {
        transactionBody.innerHTML = `
          <div class="table-row"><span>No transactions yet</span></div>
        `;
        return;
      }

      transactions.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      transactionBody.innerHTML = transactions
        .map((t) => {
          const isDeposit = t.type === "deposit";
          const source = t.source === "momo" ? "MoMo" : "Bank";
          const network = t.network ? ` (${t.network})` : "";
          const customer =
            t.customer_name || t.customer_phone || "Walk-in Customer";

          return `
            <div class="table-row">
              <div class="customer-info">
                <span class="customer-name">${escapeHtml(customer)}</span>
                <span class="txn-type">${source} ${
            isDeposit ? "Deposit" : "Withdrawal"
          }${network}</span>
                <small style="color:#95a5a6;">by ${escapeHtml(
                  t.agent_name || user.first_name
                )}</small>
              </div>

              <span class="amount ${isDeposit ? "positive" : "negative"}">
                ${isDeposit ? "+" : "-"} GHC ${Number(t.amount).toFixed(2)}
              </span>

              <span class="date">${new Date(
                t.created_at
              ).toLocaleString()}</span>

              <span class="source-badge ${source.toLowerCase()}">${source}</span>
            </div>
          `;
        })
        .join("");

    } catch (error) {
      console.error("Transaction Error:", error);
      transactionBody.innerHTML = `
        <div class="table-row error"><span>${error.message}</span></div>
      `;
    }
  }

  // ============================
  // SOCKET REAL-TIME
  // ============================
  const socket = io("http://localhost:8000", {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("Live");
    if (user.id) socket.emit("joinAgent", user.id);
  });

  socket.on("newTransaction", (tx) => {
    if (!transactionBody) return;

    const row = document.createElement("div");
    row.className = "table-row";

    const source = tx.source === "momo" ? "MoMo" : "Bank";
    const isDeposit = tx.type === "deposit";
    const customer = tx.customer_name || tx.customer_phone || "Walk-in";

    row.innerHTML = `
      <div class="customer-info">
        <span class="customer-name">${escapeHtml(customer)}</span>
        <span class="txn-type">${source} ${
      isDeposit ? "Deposit" : "Withdrawal"
    }</span>
        <small style="color:#27ae60; font-weight:600;">Just now</small>
      </div>

      <span class="amount ${isDeposit ? "positive" : "negative"}">
        ${isDeposit ? "+" : "-"} GHC ${Number(tx.amount).toFixed(2)}
      </span>

      <span class="date">Just now</span>

      <span class="source-badge ${source.toLowerCase()}">${source}</span>
    `;

    transactionBody.insertBefore(row, transactionBody.firstChild);

    loadDashboard();
  });

  // ============================
  // ESCAPE HTML
  // ============================
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // ============================
  // INIT
  // ============================
  document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    loadTransactions();
  });

})();
