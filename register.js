document.querySelector("#register-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const first_name = document.querySelector("#firstname").value;
    const last_name = document.querySelector("#lastname").value;
    const email = document.querySelector("#email").value;
    const phone = document.querySelector("#phone").value;
    const role = document.querySelector("#role").value;
    const password = document.querySelector("#password").value;

    const userData = { first_name, last_name, email, phone, role, password };

    const response = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (data.success) {
        alert(`✅ User Registered!\nGenerated Username: ${data.username}`);
    } else {
        alert(`❌ Error: ${data.message}`);
    }
});
