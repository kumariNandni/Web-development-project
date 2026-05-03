// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Global variables
let currentView = 'dashboard';
let deptChart = null;
let allContacts = [];

// ==================== TOAST NOTIFICATIONS ====================

function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== UTILITY FUNCTIONS ====================

function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== API CALLS ====================

async function fetchDashboardData() {
    try {
        const response = await fetch(`${API_BASE_URL}/analytics/dashboard`);
        const data = await response.json();
        
        document.getElementById('stat-total-contacts').textContent = data.total_contacts;
        document.getElementById('stat-total-departments').textContent = data.total_departments;
        document.getElementById('stat-active-contacts').textContent = data.total_contacts;
        
        updateDepartmentChart(data.department_distribution);
        updateActivitiesList(data.recent_activities);
        return data;
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return null;
    }
}

async function fetchContacts() {
    try {
        const search = document.getElementById('global-search')?.value || '';
        const department = document.getElementById('department-filter')?.value || '';
        
        let url = `${API_BASE_URL}/contacts?`;
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (department) url += `department=${encodeURIComponent(department)}`;
        
        const response = await fetch(url);
        const contacts = await response.json();
        allContacts = contacts;
        displayContacts(contacts);
        return contacts;
    } catch (error) {
        console.error('Error fetching contacts:', error);
        return [];
    }
}

async function fetchDepartments() {
    try {
        const response = await fetch(`${API_BASE_URL}/departments`);
        const departments = await response.json();
        
        // Populate filter dropdown
        const filterSelect = document.getElementById('department-filter');
        if (filterSelect) {
            const currentValue = filterSelect.value;
            filterSelect.innerHTML = '<option value="">All Departments</option>';
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.name;
                option.textContent = dept.name;
                if (option.value === currentValue) option.selected = true;
                filterSelect.appendChild(option);
            });
        }
        
        // Populate add-contact and edit-contact dropdowns with "Select Department"
        ['contact-department', 'edit-contact-department'].forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Select Department</option>';
                departments.forEach(dept => {
                    const option = document.createElement('option');
                    option.value = dept.name;
                    option.textContent = dept.name;
                    if (option.value === currentValue) option.selected = true;
                    select.appendChild(option);
                });
            }
        });
        
        return departments;
    } catch (error) {
        console.error('Error fetching departments:', error);
        return [];
    }
}

async function addContact(contactData) {
    try {
        const response = await fetch(`${API_BASE_URL}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contactData)
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification('Contact added successfully!', 'success');
            document.getElementById('contact-form').reset();
            await fetchContacts();
            await fetchDashboardData();
            switchView('contacts');
            return true;
        } else {
            showNotification(result.error || 'Failed to add contact', 'error');
        }
        return false;
    } catch (error) {
        console.error('Error adding contact:', error);
        showNotification('Error adding contact', 'error');
        return false;
    }
}

async function updateContact(id, contactData) {
    try {
        const response = await fetch(`${API_BASE_URL}/contacts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contactData)
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification('Contact updated successfully!', 'success');
            closeEditModal();
            await fetchContacts();
            await fetchDashboardData();
            return true;
        } else {
            showNotification(result.error || 'Failed to update contact', 'error');
        }
        return false;
    } catch (error) {
        console.error('Error updating contact:', error);
        showNotification('Error updating contact', 'error');
        return false;
    }
}

async function deleteContact(id, name) {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
        try {
            const response = await fetch(`${API_BASE_URL}/contacts/${id}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                showNotification('Contact deleted successfully!', 'success');
                await fetchContacts();
                await fetchDashboardData();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting contact:', error);
            showNotification('Error deleting contact', 'error');
            return false;
        }
    }
    return false;
}

async function sendChatMessage(message) {
    try {
        const response = await fetch(`${API_BASE_URL}/chatbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Error sending chat message:', error);
        return "Sorry, I'm having trouble connecting. Please try again later.";
    }
}

// ==================== UI UPDATE FUNCTIONS ====================

function updateDepartmentChart(distribution) {
    const canvas = document.getElementById('dept-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const departments = distribution.map(item => item.department);
    const counts = distribution.map(item => item.count);
    
    if (deptChart) deptChart.destroy();
    
    if (departments.length === 0) {
        // No data — show a message instead of empty chart
        canvas.style.display = 'none';
        let msg = canvas.parentElement.querySelector('.no-data-msg');
        if (!msg) {
            msg = document.createElement('p');
            msg.className = 'no-data-msg';
            msg.style.cssText = 'text-align:center;color:#999;padding:40px 0;';
            msg.textContent = 'No department data yet. Add contacts to see distribution.';
            canvas.parentElement.appendChild(msg);
        }
        return;
    }
    
    canvas.style.display = 'block';
    const existingMsg = canvas.parentElement.querySelector('.no-data-msg');
    if (existingMsg) existingMsg.remove();
    
    deptChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: departments,
            datasets: [{
                data: counts,
                backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: { legend: { position: 'bottom', labels: { padding: 15, usePointStyle: true } } }
        }
    });
}

function updateActivitiesList(activities) {
    const container = document.getElementById('activities-list');
    if (!container) return;
    
    if (!activities || activities.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;">No recent activities</p>';
        return;
    }
    
    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-row">
                <div><i class="fas fa-circle" style="font-size:8px;color:#667eea;margin-right:10px;"></i><strong>${escapeHtml(activity.action)}</strong></div>
                <small style="color:#999;">${new Date(activity.timestamp).toLocaleTimeString()}</small>
            </div>
            ${activity.details ? `<p class="activity-detail">${escapeHtml(activity.details)}</p>` : ''}
        </div>
    `).join('');
}

function displayContacts(contacts) {
    const container = document.getElementById('contacts-grid');
    if (!container) return;
    
    if (!contacts || contacts.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1;padding:60px 0;font-size:16px;">No contacts found. Add some contacts to get started!</p>';
        return;
    }
    
    container.innerHTML = contacts.map(contact => `
        <div class="contact-card">
            <div class="contact-avatar"><i class="fas fa-user-circle"></i></div>
            <h3>${escapeHtml(contact.name)}</h3>
            <div class="contact-info">
                <p><i class="fas fa-envelope"></i> ${escapeHtml(contact.email)}</p>
                <p><i class="fas fa-phone"></i> ${escapeHtml(contact.phone)}</p>
                ${contact.department && contact.department !== 'Unassigned' ? `<p><i class="fas fa-building"></i> ${escapeHtml(contact.department)}</p>` : ''}
                ${contact.position && contact.position !== 'Not Specified' ? `<p><i class="fas fa-briefcase"></i> ${escapeHtml(contact.position)}</p>` : ''}
            </div>
            ${contact.tags && contact.tags.length > 0 && contact.tags[0] !== '' ? `
                <div class="contact-tags">${contact.tags.map(tag => `<span class="tag">${escapeHtml(tag.trim())}</span>`).join('')}</div>
            ` : ''}
            <div class="contact-actions">
                <button class="btn-edit" onclick="editContact(${contact.id})"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn-delete" onclick="deleteContact(${contact.id}, '${escapeHtml(contact.name).replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>
    `).join('');
}

// ==================== VIEW MANAGEMENT ====================

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    
    const selectedView = document.getElementById(`${viewName}-view`);
    if (selectedView) selectedView.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-view') === viewName) btn.classList.add('active');
    });
    
    const titles = { 'dashboard': 'Dashboard', 'contacts': 'Contacts Directory', 'add-contact': 'Add New Contact', 'analytics': 'Analytics' };
    const subtitles = { 'dashboard': 'Welcome to your AI-powered directory system', 'contacts': 'Browse and manage all contacts', 'add-contact': 'Create a new contact entry', 'analytics': 'View directory insights and statistics' };
    
    document.getElementById('page-title').textContent = titles[viewName] || 'Dashboard';
    document.getElementById('page-subtitle').textContent = subtitles[viewName] || '';
    
    if (viewName === 'dashboard') fetchDashboardData();
    else if (viewName === 'contacts') fetchContacts();
    
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('active');
    currentView = viewName;
}

// ==================== EDIT CONTACT MODAL ====================

function editContact(id) {
    const contact = allContacts.find(c => c.id === id);
    if (!contact) return;
    
    document.getElementById('edit-contact-id').value = contact.id;
    document.getElementById('edit-contact-name').value = contact.name || '';
    document.getElementById('edit-contact-email').value = contact.email || '';
    document.getElementById('edit-contact-phone').value = contact.phone || '';
    document.getElementById('edit-contact-position').value = (contact.position === 'Not Specified' ? '' : contact.position) || '';
    document.getElementById('edit-contact-company').value = (contact.company === 'Not Specified' ? '' : contact.company) || '';
    document.getElementById('edit-contact-tags').value = contact.tags ? contact.tags.join(', ') : '';
    document.getElementById('edit-contact-bio').value = contact.bio || '';
    
    const deptSelect = document.getElementById('edit-contact-department');
    if (deptSelect) {
        const dept = contact.department === 'Unassigned' ? '' : contact.department;
        for (let i = 0; i < deptSelect.options.length; i++) {
            deptSelect.options[i].selected = deptSelect.options[i].value === dept;
        }
    }
    
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

function handleEditFormSubmit(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-contact-id').value;
    const tagsRaw = document.getElementById('edit-contact-tags').value;
    const tagsArray = tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : [];
    
    const contactData = {
        name: document.getElementById('edit-contact-name').value,
        email: document.getElementById('edit-contact-email').value,
        phone: document.getElementById('edit-contact-phone').value,
        department: document.getElementById('edit-contact-department').value,
        position: document.getElementById('edit-contact-position').value,
        company: document.getElementById('edit-contact-company').value,
        tags: tagsArray,
        bio: document.getElementById('edit-contact-bio').value
    };
    
    updateContact(id, contactData);
}

// ==================== FORM HANDLERS ====================

function handleContactFormSubmit(event) {
    event.preventDefault();
    
    const tags = document.getElementById('contact-tags').value;
    const tagsArray = tags ? tags.split(',').map(t => t.trim()) : [];
    
    const contactData = {
        name: document.getElementById('contact-name').value,
        email: document.getElementById('contact-email').value,
        phone: document.getElementById('contact-phone').value,
        department: document.getElementById('contact-department').value,
        position: document.getElementById('contact-position').value,
        company: document.getElementById('contact-company').value,
        tags: tagsArray,
        bio: document.getElementById('contact-bio').value
    };
    
    addContact(contactData);
}

// ==================== CHATBOT FUNCTIONS ====================

function toggleChatbot() {
    const container = document.getElementById('chatbot-container');
    const icon = document.querySelector('#chatbot-toggle .fa-chevron-down');
    
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        container.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

async function sendChatMessageFromUI() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;
    
    addChatMessage(message, 'user');
    input.value = '';
    
    const response = await sendChatMessage(message);
    addChatMessage(response, 'bot');
}

function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const icon = sender === 'user' ? 'fa-user' : 'fa-robot';
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fas ${icon}"></i></div>
        <div class="message-content"><p>${escapeHtml(message)}</p></div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            if (view) switchView(view);
        });
    });
    
    // Mobile menu toggle
    const menuToggle = document.getElementById('mobile-menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-data');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (currentView === 'dashboard') fetchDashboardData();
            else if (currentView === 'contacts') fetchContacts();
            showNotification('Data refreshed!', 'info');
        });
    }
    
    // Contact form
    const contactForm = document.getElementById('contact-form');
    if (contactForm) contactForm.addEventListener('submit', handleContactFormSubmit);
    
    // Cancel form button
    const cancelBtn = document.getElementById('cancel-form');
    if (cancelBtn) cancelBtn.addEventListener('click', () => switchView('dashboard'));
    
    // Global search — auto-switch to contacts view
    const globalSearch = document.getElementById('global-search');
    if (globalSearch) {
        globalSearch.addEventListener('input', debounce(() => {
            if (globalSearch.value.trim()) {
                if (currentView !== 'contacts') switchView('contacts');
                else fetchContacts();
            } else if (currentView === 'contacts') {
                fetchContacts();
            }
        }, 400));
    }
    
    // Department filter
    const deptFilter = document.getElementById('department-filter');
    if (deptFilter) deptFilter.addEventListener('change', () => { if (currentView === 'contacts') fetchContacts(); });
    
    // Refresh contacts button
    const refreshContacts = document.getElementById('refresh-contacts');
    if (refreshContacts) refreshContacts.addEventListener('click', () => fetchContacts());
    
    // Edit modal
    const editForm = document.getElementById('edit-contact-form');
    if (editForm) editForm.addEventListener('submit', handleEditFormSubmit);
    
    const closeEditBtn = document.getElementById('close-edit-modal');
    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
    
    const cancelEditBtn = document.getElementById('cancel-edit');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);
    
    // Close modal on overlay click
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
        });
    }
    
    // Chatbot
    const chatbotToggle = document.getElementById('chatbot-toggle');
    if (chatbotToggle) chatbotToggle.addEventListener('click', toggleChatbot);
    
    const chatSend = document.getElementById('chat-send');
    if (chatSend) chatSend.addEventListener('click', sendChatMessageFromUI);
    
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessageFromUI();
        });
    }
}

// ==================== INITIALIZATION ====================

async function init() {
    console.log('Initializing AI Directory Management System...');
    
    setupEventListeners();
    
    await fetchDepartments();
    await fetchDashboardData();
    await fetchContacts();
    
    setTimeout(() => hideLoading(), 800);
    console.log('Application ready!');
}

window.addEventListener('DOMContentLoaded', init);
