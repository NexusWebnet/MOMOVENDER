// frontend/js/login.js — FIXED FOR MOBILE & NGROK
document.querySelector('.login-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const emailOrUsername = this.querySelector('input[type="text"]').value.trim();
    const password = this.querySelector('input[type="password"]').value.trim();

    if (!emailOrUsername || !password) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        const device_info = navigator.userAgent;
        const ip_address = "Unknown";

        // FIXED: Use relative path — works on localhost, IP, ngrok, anywhere!
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailOrUsername, password, device_info, ip_address })
        });

        const data = await response.json();

        if (data.success) {
            // Save user data and token
            localStorage.setItem("user", JSON.stringify({
                id: data.id,
                first_name: data.first_name,
                last_name: data.last_name,
                username: data.username,
                role: data.role,
                branch_id: data.branch_id
            }));

            localStorage.setItem("token", data.token);

            alert(`Welcome back, ${data.first_name || data.username}!`);

            // Redirect based on role
            switch (data.role) {
                case "admin":
                    window.location.href = "/ADMIN/admin.html";
                    break;
                case "manager":
                    window.location.href = "/MANAGER/pages/Dashboard.html";
                    break;
                case "employee":
                    window.location.href = "/EMPLOYEE/pages/index.html";
                    break;
                default:
                    alert("Unknown role. Redirecting to employee dashboard.");
                    window.location.href = "/EMPLOYEE/pages/index.html";
            }
        } else {
            alert("Login failed: " + (data.message || "Invalid credentials"));
        }

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        alert("Connection failed. Check your internet or server status.");
    }
});