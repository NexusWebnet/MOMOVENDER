// frontend/js/login.js  ← REPLACE YOUR WHOLE FILE WITH THIS
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

        const response = await fetch("http://localhost:8000/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailOrUsername, password, device_info, ip_address })
        });

        const data = await response.json();

        if (data.success) {
            // SAVE USER + TOKEN (THIS WAS MISSING!)
            localStorage.setItem("user", JSON.stringify({
                id: data.id || data.user_id,           // make sure ID is saved
                first_name: data.first_name,
                last_name: data.last_name,
                username: data.username,
                role: data.role,
                branch_id: data.branch_id               // important for branch filtering
            }));

            localStorage.setItem("token", data.token);  // THIS LINE FIXES EVERYTHING!

            alert(`Login successful! ROLE: ${data.role.toUpperCase()}`);

            // Redirect based on role
            switch (data.role) {
                case "admin":
                    window.location.href = "ADMIN/admin.html";
                    break;
                case "manager":
                    window.location.href = "MANAGER/pages/Dashboard.html";
                    break;
                case "employee":
                    window.location.href = "EMPLOYEE/pages/index.html";
                    break;
                default:
                    alert("Unknown role.");
            }
        } else {
            alert("Login failed: " + data.message);
        }

    } catch (error) {
        alert("Cannot connect to server. Is backend running on http://localhost:8000?");
        console.error("LOGIN ERROR:", error);
    }
});