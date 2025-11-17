const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

async function createApiUser() {
    const apiUserId = uuidv4(); // GENERATE UNIQUE API USER ID
    console.log("Generated API User:", apiUserId);

    const url = "https://sandbox.momodeveloper.mtn.com/v1_0/apiuser";

    try {
        await axios.post(
            url,
            {
                providerCallbackHost: "https://example.com"
            },
            {
                headers: {
                    "X-Reference-Id": apiUserId,
                    "Ocp-Apim-Subscription-Key": process.env.DIS_PRIMARY_KEY,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("API User created successfully!");
        return apiUserId;

    } catch (err) {
        console.error("Error creating API User:", err.response?.data || err.message);
        return null;
    }
}

async function createApiKey(apiUserId) {
    const url = `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/${apiUserId}/apikey`;

    try {
        const res = await axios.post(
            url,
            {},
            {
                headers: {
                    "Ocp-Apim-Subscription-Key": process.env.DIS_PRIMARY_KEY
                }
            }
        );

        console.log("API Key generated!");
        console.log("Your API Key:", res.data.apiKey);
        return res.data.apiKey;

    } catch (err) {
        console.error("Error generating API Key:", err.response?.data || err.message);
        return null;
    }
}

async function run() {
    console.log("---- MTN MOMO API USER CREATION ----");

    const apiUserId = await createApiUser();
    if (!apiUserId) return;

    const apiKey = await createApiKey(apiUserId);
    if (!apiKey) return;

    console.log("\n------ COPY THESE INTO YOUR .env ------");

    console.log(`DIS_API_USER=${apiUserId}`);
    console.log(`DIS_API_KEY=${apiKey}`);

    console.log("--------------------------------------");
}

run();
