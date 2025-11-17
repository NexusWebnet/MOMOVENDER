// ✅ Simulate DB fetch (keep as is)
async function fetchCustomerFromDB(phoneNumber) {
    const mockDB = {
        "0541111111": "Kwame Adu",
        "0242222222": "Ama Mensah",
        "0273333333": "Yaw Kofi"
    };
    return mockDB[phoneNumber] || "";
}

// ✅ Auto-fill customer name
document.getElementById("customerNumber").addEventListener("keyup", async function () {
    const number = this.value;
    if (number.length === 10) {
        const name = await fetchCustomerFromDB(number);
        document.getElementById("customerName").value = name || "Not found in system";
    }
});

// ✅ Submit form
document.getElementById("momoForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const network = document.getElementById("network").value;
    const custName = document.getElementById("customerName").value;
    const amount = document.getElementById("amount").value;
    const ref = document.getElementById("reference").value;

    const transactionId = "MOMO-" + Math.floor(100000 + Math.random() * 900000);

    // 🔥 Call backend to process withdrawal
    try {
        const response = await fetch("http://localhost:4000/withdraw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                phone: document.getElementById("customerNumber").value,
                amount: amount,
                id: transactionId
            })
        });

        const data = await response.json();

        if (data.status) {
            alert("Transaction Submitted!\nReference ID: " + data.referenceId);
            // Save info in sessionStorage for receipt
            sessionStorage.setItem("network", network);
            sessionStorage.setItem("customerName", custName);
            sessionStorage.setItem("amount", amount);
            sessionStorage.setItem("reference", ref);
            sessionStorage.setItem("transactionId", transactionId);
            sessionStorage.setItem("momoReferenceId", data.referenceId);

            window.location.href = "reciept.html"; // Redirect to receipt page
        } else {
            alert("Transaction Failed. Try again.");
        }
    } catch (err) {
        console.error(err);
        alert("Error contacting server. Make sure backend is running.");
    }
});
