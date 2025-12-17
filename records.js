document.addEventListener("DOMContentLoaded", async () => {
  // ✅ Get user and record type from localStorage
  const user = JSON.parse(localStorage.getItem("user"));
  const recordType = localStorage.getItem("recordType");

  // ❌ Redirect if not logged in
  if (!user) {
    alert("⚠️ Please login first!");
    window.location.href = "../login.html"; // parent folder
    return;
  }

  // ✅ Set page title dynamically
  const titleMap = {
    transaction: "All Transactions",
    momo: "Mobile Money Transactions",
    bank: "Bank Transactions",
    sim: "Sim Card Sales",
  };

  document.getElementById("recordTitle").textContent = titleMap[recordType] || "Transaction Records";

  try {
    // ✅ Fetch records from backend API
    const res = await fetch(
      `http://localhost:8000/api/records/${user.id}?type=${recordType}&role=${user.role}`
    );

    const data = await res.json();

    // ✅ Populate table
    const tbody = document.querySelector("#recordsTable tbody");
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray;">No records found</td></tr>`;
      return;
    }

    data.forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.transaction_id}</td>
        <td>${t.transaction_type}</td>
        <td>${t.payment_method}</td>
        <td>GHC ${t.amount.toFixed(2)}</td>
        <td>${t.status}</td>
        <td>${new Date(t.created_at).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("❌ Error loading records:", err);
    const tbody = document.querySelector("#recordsTable tbody");
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error loading records</td></tr>`;
  }
});
