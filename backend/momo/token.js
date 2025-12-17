// momo/token.js
const axios = require("axios");
require("dotenv").config();

async function generateDisToken() {
  const url = "https://sandbox.momodeveloper.mtn.com/disbursement/token/";

  const auth = Buffer.from(
    `${process.env.DIS_API_USER}:${process.env.DIS_API_KEY}`
  ).toString("base64");

  try {
    const res = await axios.post(url, {}, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Ocp-Apim-Subscription-Key": process.env.DIS_PRIMARY_KEY,
      },
    });
    return res.data.access_token;
  } catch (err) {
    console.error("TOKEN ERROR:", err.response?.data || err.message);
    return null;
  }
}

module.exports = generateDisToken;