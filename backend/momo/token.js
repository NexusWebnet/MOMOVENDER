const axios = require("axios");
require("dotenv").config();

async function generateDisToken() {
    const url = "https://sandbox.momodeveloper.mtn.com/disbursement/token/";

    const headers = {
        "Authorization": "Basic " + Buffer.from(
            process.env.DIS_API_USER + ":" + process.env.DIS_API_KEY
        ).toString("base64"),
        "Ocp-Apim-Subscription-Key": process.env.DIS_PRIMARY_KEY
    };

    try {
        const response = await axios.post(url, {}, { headers });
        return response.data.access_token;
    } catch (error) {
        console.error("TOKEN ERROR:", error.response?.data || error.message);
        return null;
    }
}

module.exports = generateDisToken;
