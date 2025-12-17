// Handle back arrow click (placeholder)
document.querySelector('.header-icon.left').addEventListener('click', function() {
    alert('Back button clicked!'); // Replace with actual navigation logic (e.g., window.history.back())
});

// Toggle notification alert (placeholder)
document.querySelector('.header-icon.right').addEventListener('click', function() {
    alert('Notification clicked!'); // Replace with actual notification logic
});

// Handle record button clicks
document.querySelectorAll('.record-btn').forEach(button => {
    button.addEventListener('click', function() {
        const type = this.closest('.record-card').getAttribute('data-type');
        alert(`Viewing ${type} Records`); // Replace with actual record display logic
    });
});

// Handle navigation item selection
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        // Remove active class from all items
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        // Add active class to clicked item
        this.classList.add('active');

        // Example: Log the selected section (replace with navigation logic)
        const section = this.getAttribute('data-section');
        console.log(`Navigated to ${section}`);
    });
});

// Set initial active item (Transaction)
document.querySelector('.nav-item[data-section="transaction"]').classList.add('active');

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