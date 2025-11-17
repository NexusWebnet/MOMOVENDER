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

// Set initial active item (e.g., Dashboard)
document.querySelector('.nav-item[data-section="dashboard"]').classList.add('active');