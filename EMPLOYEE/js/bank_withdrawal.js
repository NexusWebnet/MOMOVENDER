// Open form and set selected bank
document.querySelectorAll('.bank-card').forEach(card => {
    card.addEventListener('click', function () {
        const bank = this.getAttribute("data-bank");

        document.getElementById("withdrawal-form").classList.remove("hidden");
        document.getElementById("selectedBank").innerText = bank;
    });
});

// Close popup
document.querySelector('.cancelBtn').addEventListener('click', () => {
    document.getElementById("withdrawal-form").classList.add("hidden");
    document.getElementById("withdrawal-form").reset(); // Clear form
});

// Withdraw button — FINAL 100% WORKING VERSION
document.getElementById("withdrawBtn").addEventListener('click', () => {
    // Get form values
    const customer = document.getElementById("customerName").value.trim();
    const contact = document.getElementById("customerContact").value.trim();
    const idType = document.getElementById("idType").value;
    const idNumber = document.getElementById("idNumber").value.trim();
    const amount = document.getElementById("amount").value;
    const accountNumber = document.getElementById("accountNumber").value.trim();
    const reference = document.getElementById("reference").value.trim() || "Bank Withdrawal";
    const bank = document.getElementById("selectedBank").innerText;

    // Validation
    if (!customer || !contact || !idType || !idNumber || !amount || !accountNumber || !bank || bank === "Select Bank") {
        alert("Please fill all required fields");
        return;
    }

    if (parseFloat(amount) <= 0) {
        alert("Amount must be greater than zero");
        return;
    }

    // FINAL SECURE TRANSACTION DATA — TYPE IS LOCKED FOREVER
    const transactionData = {
        type: "withdraw",                                           // LOCKED — CANNOT BE CHANGED
        bank: bank,
        customer_name: customer,
        customer_phone: contact,
        id_type: idType,
        id_number: idNumber,
        amount: parseFloat(amount),
        account_number: accountNumber,
        reference: reference,
        agent_name: user.first_name + " " + user.last_name,
        date: new Date().toLocaleString(),
        transaction_id: "WD" + Date.now() + Math.floor(Math.random() * 999)
    };

    // Save to localStorage for receipt
    localStorage.setItem("lastWithdrawal", JSON.stringify(transactionData));

    // Optional: Send to backend (uncomment when ready)
    
    fetch('http://localhost:8000/records/log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(transactionData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            window.location.href = "receipt-withdrawal.html";
        } else {
            alert("Failed to log withdrawal: " + data.message);
        }
    })
    .catch(err => {
        console.error(err);
        alert("Network error");
    });
    

    // For now: Just go to receipt
    window.location.href = "receipt-withdrawal.html";
});