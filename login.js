// // frontend/js/login.js
// document.querySelector('.login-form').addEventListener('submit', async function(e) {
//     e.preventDefault();

//     const emailOrUsername = this.querySelector('input[type="text"]').value.trim();
//     const password = this.querySelector('input[type="password"]').value.trim();

//     if (!emailOrUsername || !password) {
//         alert("Please fill in all fields.");
//         return;
//     }

//     try {
//         // Get device info from browser
//         const device_info = navigator.userAgent;

//         // Optionally get public IP
//         const ipResponse = await fetch("https://api.ipify.org?format=json");
//         const ipData = await ipResponse.json();
//         const ip_address = ipData.ip;

//         const response = await fetch("http://localhost:8000/api/auth/login", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ emailOrUsername, password, device_info, ip_address })
//         });

//         const data = await response.json();

//         if (data.success) {
//             // ✅ Save user to localStorage
//             localStorage.setItem("user", JSON.stringify({
//                 first_name: data.first_name,
//                 last_name: data.last_name,
//                 username: data.username,
//                 role: data.role
//             }));

//             alert(`✅ Login successful! ROLE: ${data.role.toUpperCase()}`);

//             // ✅ Redirect based on role
//             switch (data.role) {
//                 case "admin":
//                     window.location.href = "admin/dashboard.html";
//                     break;
//                 case "manager":
//                     window.location.href = "manager/pages/index.html";
//                     break;
//                 case "employee":
//                     window.location.href = "EMPLOYEE/pages/index.html";
//                     break;
//                 default:
//                     alert("⚠️ Unknown role. Contact system admin.");
//             }
//         } else {
//             alert("❌ " + data.message);
//         }

//     } catch (error) {
//         alert("⚠️ Can't connect to server. Make sure backend is running.");
//         console.error("SERVER ERROR:", error);
//     }
// });




// frontend/js/login.js
document.querySelector('.login-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const emailOrUsername = this.querySelector('input[type="text"]').value.trim();
    const password = this.querySelector('input[type="password"]').value.trim();

    if (!emailOrUsername || !password) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        // Get device info
        const device_info = navigator.userAgent;

        // ❌ Remove IP fetching to avoid CORS errors
        const ip_address = "Unknown";

        const response = await fetch("http://localhost:8000/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailOrUsername, password, device_info, ip_address })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem("user", JSON.stringify({
                first_name: data.first_name,
                last_name: data.last_name,
                username: data.username,
                role: data.role
            }));

            alert(`✅ Login successful! ROLE: ${data.role.toUpperCase()}`);

            switch (data.role) {
                case "admin":
                    window.location.href = "../admin/dashboard.html";
                    break;
                case "manager":
                    window.location.href = "../manager/pages/index.html";
                    break;
                case "employee":
                    window.location.href = "EMPLOYEE/pages/index.html";
                    break;
                default:
                    alert("⚠️ Unknown role. Contact system admin.");
            }
        } else {
            alert("❌ " + data.message);
        }

    } catch (error) {
        alert("⚠️ Can't connect to server. Make sure backend is running on http://localhost:8000");
        console.error("SERVER ERROR:", error);
    }
});
