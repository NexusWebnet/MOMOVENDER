// Daily Performance Chart
const dailyCtx = document.getElementById('dailyChart').getContext('2d');
new Chart(dailyCtx, {
  type: 'bar',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [{
      label: 'Transactions',
      data: [500, 700, 800, 600, 900],
      backgroundColor: '#ffd700'
    }]
  },
  options: {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  }
});

// Monthly Revenue Chart
const revenueCtx = document.getElementById('revenueChart').getContext('2d');
new Chart(revenueCtx, {
  type: 'line',
  data: {
    labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
    datasets: [{
      label: 'Revenue',
      data: [2000, 2500, 3000, 3500, 4000],
      borderColor: '#fff',
      backgroundColor: 'rgba(255,255,255,0.2)',
      fill: true,
      tension: 0.3
    }]
  },
  options: {
    plugins: { legend: { labels: { color: '#fff' } } },
    scales: {
      x: { ticks: { color: '#fff' } },
      y: { ticks: { color: '#fff' }, beginAtZero: true }
    }
  }
});
// Toggle forms on button click
document.querySelectorAll('.button-card').forEach(button => {
    button.addEventListener('click', function() {
        const formId = this.getAttribute('data-form');
        const form = document.getElementById(formId + '-form');
        
        // Hide all forms
        document.querySelectorAll('.form-container').forEach(f => f.classList.add('hidden'));
        
        // Show the selected form
        if (form) {
            form.classList.remove('hidden');
        }
    });
});

// Cancel button functionality
document.querySelectorAll('.form-cancel').forEach(button => {
    button.addEventListener('click', function() {
        this.closest('.form-container').classList.add('hidden');
    });
});