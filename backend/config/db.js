const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: "127.0.0.1",
    user: "root",
    password: "",          // <-- if blank leave empty
    database: "banking_app",
    port: 3306
});

connection.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
        return;
    }
    console.log("✅ Database connected successfully!");
});

module.exports = connection;
