const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const generateDisToken = require("./token");

async function sendWithdrawal(phone, amount, transactionId) {

    const token = await generateDisToken();
    if (!token) return null;

    const referenceId = uuidv4();

    const url = "https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer";

    const body = {
        amount: amount.toString(),
        currency: "GHS",
        externalId: transactionId,
        payee: {
            partyIdType: "MSISDN",
            partyId: phone
        },
        payerMessage: "Withdrawal",
        payeeNote: "Employee withdrawal"
    };

    const headers = {
        "Authorization": `Bearer ${token}`,
        "X-Reference-Id": referenceId,
        "X-Target-Environment": process.env.MOMO_ENV,
        "Ocp-Apim-Subscription-Key": process.env.DIS_PRIMARY_KEY,
        "Content-Type": "application/json"
    };

    try {
        await axios.post(url, body, { headers });
        return referenceId;
    } catch (e) {
        console.error("DISBURSE ERROR:", e.response?.data || e.message);
        return null;
    }
}

module.exports = { sendWithdrawal };
