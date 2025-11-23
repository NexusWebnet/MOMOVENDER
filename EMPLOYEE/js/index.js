// EMPLOYEE/js/index.js
// Frontend logic for dashboard, recent transactions, messaging, and navigation

// -------------- Helper --------------
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch (e) {
    return null;
  }
}

// -------------- DOM READY --------------
document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();
  if (user) {
    const welcome = document.getElementById("welcomeText");
    if (welcome) welcome.textContent = `Welcome, ${user.first_name || ""} ${user.last_name || ""}!`;
  }

  // Search filter
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase();
      document.querySelectorAll("#transaction-body .table-row").forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(searchTerm) ? "" : "none";
      });
    });
  }

  // Load dashboard cards and recent transactions
  loadDashboardData();

  // Update notification badge
  updateNotificationBadge();
});

// ---------------- Load recent transactions for logged-in user ----------------
async function loadRecentTransactions(type = "transaction") {
  const user = getCurrentUser();
  if (!user) return;

  try {
    let url = `http://localhost:8000/api/records/${user.id}?type=${type}&role=${user.role}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch recent transactions");

    const data = await res.json();
    const tbody = document.getElementById("transaction-body");
    tbody.innerHTML = "";

    if (data && data.length > 0) {
      data.slice(0, 20).forEach(tx => {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `
          <span>${tx.transaction_type || "Unknown"}</span>
          <span>GHC ${Number(tx.amount || 0).toFixed(2)}</span>
          <span>${new Date(tx.created_at).toLocaleString()}</span>
        `;
        tbody.appendChild(row);
      });
    } else {
      tbody.innerHTML = `
        <div class="table-row">
          <span style="text-align:center; width:100%; color:gray;">No transactions found</span>
        </div>
      `;
    }
  } catch (err) {
    console.warn("Recent transactions fetch failed:", err);
    const tbody = document.getElementById("transaction-body");
    tbody.innerHTML = `
      <div class="table-row">
        <span style="text-align:center; width:100%; color:red;">Error loading transactions</span>
      </div>
    `;
  }
}

function goToRecords(type) {
  const user = getCurrentUser();
  if (!user) {
    alert("Please login first.");
    window.location.href = "../login.html";
    return;
  }

  localStorage.setItem("recordType", type);
  localStorage.setItem("userRole", user.role);
  localStorage.setItem("userId", user.id);

  window.location.href = "../../records.html";
}


// -------------- Navigation --------------
function navigate(pageName) {
  if (!pageName) return;
  window.location.href = `${pageName}.html`;
}

function toggleMenu() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("active");
}

// -------------- goToRecords --------------
function goToRecords(type) {
  const user = getCurrentUser();
  if (!user) {
    alert("Please login first.");
    window.location.href = "../login.html";
    return;
  }

  localStorage.setItem("recordType", type);
  localStorage.setItem("userId", user.id || user.user_id || "");

  window.location.href = "../../records.html";
}

// -------------- Dashboard --------------
async function loadDashboardData() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const res = await fetch(`http://localhost:8000/api/dashboard/${user.id}`);
    if (!res.ok) throw new Error("Failed to load dashboard data");
    const data = await res.json();

    const cards = document.querySelectorAll(".card");
    if (cards.length >= 4) {
      cards[0].querySelector(".amount").textContent = `GHC ${Number(data.totalTransactions || 0).toFixed(2)}`;
      cards[1].querySelector(".amount").textContent = `GHC ${Number(data.momoTransactions || 0).toFixed(2)}`;
      cards[2].querySelector(".amount").textContent = `${Number(data.bankTransactions || 0)}`;
      cards[3].querySelector(".amount").textContent = `${Number(data.simSales || 0)}`;
    }

    // Load recent transactions for logged-in user
    loadRecentTransactions("transaction");
 // top 20, all types initially
  } catch (err) {
    console.warn("Unable to fetch dashboard data:", err);
  }
}

// ---------------- Load recent transactions for logged-in user ----------------
async function loadRecentTransactions(type = "") {
  const user = getCurrentUser();
  if (!user) return;

  try {
    let url = `http://localhost:8000/api/transactions/${user.id}?limit=20`;
    if (type) url += `&type=${type}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch recent transactions");

    const data = await res.json();
    const tbody = document.getElementById("transaction-body");
    tbody.innerHTML = "";

    if (data.transactions && data.transactions.length > 0) {
      data.transactions.forEach(tx => {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `
          <span>${tx.transaction_type || tx.type || "Deposit"}</span>
          <span>GHC ${Number(tx.amount || 0).toFixed(2)}</span>
          <span>${new Date(tx.created_at).toLocaleString()}</span>
        `;
        tbody.appendChild(row);
      });
    } else {
      tbody.innerHTML = `
        <div class="table-row">
          <span colspan="3" style="text-align:center; color:gray;">No transactions found</span>
        </div>
      `;
    }
  } catch (err) {
    console.warn("Recent transactions fetch failed:", err);
    const tbody = document.getElementById("transaction-body");
    tbody.innerHTML = `
      <div class="table-row">
        <span colspan="3" style="text-align:center; color:red;">Error loading transactions</span>
      </div>
    `;
  }
}

// -------------- Notifications --------------
async function updateNotificationBadge() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const res = await fetch(`http://localhost:8000/api/notifications/${user.id}`);
    if (!res.ok) throw new Error("Failed to fetch notifications");

    const data = await res.json();
    const unreadCount = (data.notifications || []).filter(n => n.is_read === 0).length;
    const badge = document.getElementById("notificationBadge");
    if (badge) {
      badge.style.display = unreadCount > 0 ? "block" : "none";
      badge.textContent = unreadCount || "";
    }
  } catch (err) {
    console.warn("Notification fetch failed:", err);
  }
}

// -------------- Messaging --------------
async function sendMessage() {
  const user = getCurrentUser();
  if (!user) return;

  const messageInput = document.getElementById("messageInput");
  if (!messageInput) return;

  const message = messageInput.value.trim();
  if (!message) return;

  try {
    const res = await fetch("http://localhost:8000/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender_id: user.id,
        receiver_id: 1,
        message
      })
    });

    if (!res.ok) throw new Error("Message failed");

    messageInput.value = "";
    updateNotificationBadge();
  } catch (err) {
    console.warn("Message send failed:", err);
  }
}

// -------------- Expose Globals --------------
window.navigate = navigate;
window.toggleMenu = toggleMenu;
window.goToRecords = goToRecords;
window.loadRecentTransactions = loadRecentTransactions;
window.sendMessage = sendMessage;
