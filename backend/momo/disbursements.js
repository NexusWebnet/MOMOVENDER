// momo/disbursements.js
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const generateDisToken = require("./token");

async function sendWithdrawal(phone, amount, externalId) {
  const token = await generateDisToken();
  if (!token) return null;

  const referenceId = uuidv4();

  const url = "https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer";

  const payload = {
    amount: amount.toString(),
    currency: "GHS",
    externalId: externalId || "test-" + Date.now(),
    payee: {
      partyIdType: "MSISDN",
      partyId: phone.startsWith("233") ? phone : "233" + phone.replace(/^0/, ""),
    },
    payerMessage: "MoMo Shop Withdrawal",
    payeeNote: "Payment from shop",
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Reference-Id": referenceId,
    "X-Target-Environment": "sandbox",
    "Ocp-Apim-Subscription-Key": process.env.DIS_PRIMARY_KEY,
    "Content-Type": "application/json",
  };

  try {
    await axios.post(url, payload, { headers });
    console.log("SUCCESS: GHS", amount, "sent to", phone, "| Ref:", referenceId);
    return referenceId;
  } catch (err) {
    console.error("DISBURSE FAILED:", err.response?.data || err.message);
    return null;
  }
}

module.exports = { sendWithdrawal };