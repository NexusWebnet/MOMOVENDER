// Search functionality
document.getElementById('searchInput').addEventListener('input', function(e) {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#transactionTable tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
});

// Request Float button
function requestFloat() {
  alert('Float request submitted!');
}

// View All button
function viewAll() {
  alert('Redirecting to all transactions...');
}

// Placeholder for header icons (to be expanded if needed)
document.querySelectorAll('.header-icon').forEach(icon => {
  icon.addEventListener('click', function() {
    const label = this.getAttribute('aria-label');
    alert(`${label} clicked!`);
  });
});


const user = JSON.parse(localStorage.getItem("user"));

// Fetch unread notifications count
async function updateNotificationCount() {
    const response = await fetch(`http://localhost:8000/api/notifications/${user.id}`);
    const data = await response.json();

    const unreadCount = data.notifications.filter(n => n.status === "unread").length;

    const bell = document.querySelector(".fa-bell");

    if (unreadCount > 0) {
        bell.setAttribute("data-count", unreadCount);
        bell.classList.add("badge");
    }
}

updateNotificationCount();


const chatRoutes = require("./routes/chat");
app.use("/api/chat", chatRoutes);



function updateNotificationCount() {
    fetch(`http://localhost:8000/api/chat/${user.id}`)
        .then(res => res.json())
        .then(data => {
            const unread = data.messages.filter(m => m.status === "unread").length;
            const bell = document.querySelector(".fa-bell");

            if (unread > 0) {
                bell.setAttribute("data-count", unread);
                bell.classList.add("badge");
            }
        });
}

updateNotificationCount();
