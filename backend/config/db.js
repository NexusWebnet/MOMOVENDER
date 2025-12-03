const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: "localhost",      // ← CHANGE THIS LINE
    user: "root",
    password: "",           // put your real password if you have one
    database: "banking_app", // ← make sure this database actually exists
    port: 3306,
    connectTimeout: 10000,
    acquireTimeout: 10000
});

connection.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err.code);
        console.error("Try these fixes:");
        console.error("1. Is XAMPP/WAMP/MySQL running?");
        console.error("2. Did you create the database 'banking_app'?");
        console.error("3. Is port 3306 blocked by firewall?");
        process.exit(1);
    }
    console.log("Database connected successfully!");
});

module.exports = connection;