let selectedBank = "";

function selectBank(bank) {
    selectedBank = bank;
    document.getElementById("selectedBank").innerText = bank + " Deposit Form";
    
    document.getElementById("bank-selection").classList.add("hidden");
    document.getElementById("deposit-form").classList.remove("hidden");
}

function generateReceipt() {
    const customerName = document.getElementById("customerName").value;
    const depositAmount = document.getElementById("depositAmount").value;
    const transactionId = document.getElementById("transactionId").value;

    // Save data temporarily (session storage)
    sessionStorage.setItem("bank", selectedBank);
    sessionStorage.setItem("customerName", customerName);
    sessionStorage.setItem("amount", depositAmount);
    sessionStorage.setItem("transactionId", transactionId);

    window.location.href = "reciept.html"; // redirect to receipt page
}
