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
});

// Withdraw button
document.getElementById("withdrawBtn").addEventListener('click', () => {

    const transactionData = {
        type: "Bank Withdrawal",
        bank: document.getElementById("selectedBank").innerText,
        customer: document.getElementById("customerName").value,
        contact: document.getElementById("customerContact").value,
        idType: document.getElementById("idType").value,
        idNumber: document.getElementById("idNumber").value,
        amount: document.getElementById("amount").value,
        accountNumber: document.getElementById("accountNumber").value,
        reference: document.getElementById("reference").value,
        date: new Date().toLocaleDateString(),
        transID: "WD" + Math.floor(Math.random() * 900000 + 100000)
    };

    // Store in localStorage for the receipt page
    localStorage.setItem("receiptData", JSON.stringify(transactionData));

    // Redirect to receipt page
    window.location.href = "reciept.html";
});
