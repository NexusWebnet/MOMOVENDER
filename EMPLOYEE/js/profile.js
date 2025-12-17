const user = JSON.parse(localStorage.getItem("user")); // Get logged user info

// Load profile values into the input fields
document.getElementById("first_name").value = user.first_name;
document.getElementById("last_name").value = user.last_name;
document.getElementById("email").value = user.email;
document.getElementById("phone").value = user.phone;

// ✅ Update Profile (firstname, lastname, phone, email)
document.querySelector('.save-profile-btn').addEventListener('click', async function () {

    const updatedData = {
        id: user.id,
        first_name: document.getElementById("first_name").value,
        last_name: document.getElementById("last_name").value,
        email: document.getElementById("email").value,
        phone: document.getElementById("phone").value,
    };

    const res = await fetch("http://localhost:8000/api/users/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
    });

    const result = await res.json();
    alert(result.message);
});

// ✅ Change Password
document.querySelector('.change-password-btn').addEventListener('click', async function () {
    const data = {
        id: user.id,
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
        confirmPassword: document.getElementById("confirmPassword").value,
    };

    const res = await fetch("http://localhost:8000/api/users/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

    const result = await res.json();
    alert(result.message);
});
