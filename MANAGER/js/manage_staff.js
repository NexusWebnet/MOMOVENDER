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
    alert('Notification clicked!'); // Replace with actual notification 
    });


    // Show the modal
function viewAll() {
    document.getElementById('addStaffModal').style.display = 'block';
}

// Close the modal
function closeModal() {
    document.getElementById('addStaffModal').style.display = 'none';
}

// Close modal if clicked outside the content
window.onclick = function(event) {
    const modal = document.getElementById('addStaffModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

// Handle form submission
document.getElementById('addStaffForm').addEventListener('submit', function(e) {
    e.preventDefault();

    // Grab values
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const role = document.getElementById('role').value;

    console.log('New Staff:', {name, email, phone, role});
    
    // You can add code here to send data to the backend

    // Close the modal and reset form
    closeModal();
    this.reset();
});
