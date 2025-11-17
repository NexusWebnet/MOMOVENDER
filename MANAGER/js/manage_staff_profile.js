document.querySelector('.edit').addEventListener('click', () => {
  alert("Edit staff details coming soon!");
});

document.querySelector('.delete').addEventListener('click', () => {
  if (confirm("Are you sure you want to delete this staff?")) {
    alert("Staff deleted successfully.");
  }
});

document.querySelector('.suspend').addEventListener('click', () => {
  alert("Staff has been suspended.");
});

document.querySelector('.save').addEventListener('click', () => {
  alert("Security settings updated successfully!");
});

// Toggle sidebar menu
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('content');
    sidebar.classList.toggle('active');
    content.classList.toggle('active');
}

// Navigate to different sections (placeholder)
function navigate(section) {
    alert(`Navigating to ${section} page!`);
    toggleMenu(); // Close menu after navigation
}

// Handle back arrow click (placeholder)
document.querySelector('.header-icon.left').addEventListener('click', function() {
    alert('Back button clicked!'); // Replace with actual navigation logic
});

// Toggle notification alert (placeholder)
document.querySelector('.header-icon.right').addEventListener('click', function() {
    alert('Notification clicked!'); // Replace with actual notification logic
});