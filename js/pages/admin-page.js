import * as backend from '../backend.js';
import { APP_CONFIG, MESSAGES } from '../../config/constants.js';
import { getCategoryBadgeStyle } from '../ui/issue-card.js';
import { formatVolume } from '../../utils/formatters.js';

export function renderAdminPage() {
    if (!checkAdminAccess()) {
        showAdminLogin();
        return;
    }
    renderAdminIssueTable();
}

export function setupAdminFunctions() {
    setupCreateIssueModal();
}

function checkAdminAccess() {
    const adminAuth = sessionStorage.getItem('admin-auth');
    return adminAuth === 'authenticated';
}

function showAdminLogin() {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
        <div class="max-w-md mx-auto mt-16">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h2 class="text-2xl font-bold text-center mb-6">관리자 로그인</h2>
                <form id="admin-login-form">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">관리자 암호</label>
                        <input type="password" id="admin-password" class="modern-input w-full" placeholder="관리자 암호를 입력하세요" required>
                    </div>
                    <button type="submit" class="btn-primary w-full">로그인</button>
                    <div id="admin-login-error" class="hidden mt-3 text-red-600 text-sm text-center"></div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
}

function handleAdminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');
    
    if (password === APP_CONFIG.ADMIN_PASSWORD) {
        sessionStorage.setItem('admin-auth', 'authenticated');
        renderAdminPage();
    } else {
        errorEl.textContent = MESSAGES.ERROR.ADMIN_AUTH_FAILED;
        errorEl.classList.remove('hidden');
    }
}

function setupCreateIssueModal() {
    const createBtn = document.getElementById('create-issue-btn');
    const modal = document.getElementById('create-issue-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const form = document.getElementById('create-issue-form');

    if (!createBtn || !modal || !form) return;

    // Modal controls
    createBtn.addEventListener('click', () => openModal(modal));
    closeBtn?.addEventListener('click', () => closeModal(modal, form));
    cancelBtn?.addEventListener('click', () => closeModal(modal, form));
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal, form);
    });

    // Form submission
    form.addEventListener('submit', handleCreateIssue);
}

function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal, form) {
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    form.reset();
}

function handleCreateIssue(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const newIssue = {
        id: Date.now(),
        title: formData.get('title'),
        category: formData.get('category'),
        endDate: formData.get('endDate'),
        yesPrice: parseInt(formData.get('yesPrice')) || APP_CONFIG.DEFAULT_YES_PRICE,
        totalVolume: 0,
        isPopular: formData.get('isPopular') === 'on',
        correct_answer: null,
        yesVolume: 0,
        noVolume: 0
    };

    const result = addNewIssue(newIssue);
    if (result.success) {
        alert(MESSAGES.SUCCESS.ISSUE_CREATED);
        closeModal(document.getElementById('create-issue-modal'), e.target);
        renderAdminIssueTable();
    } else {
        alert(`이슈 생성에 실패했습니다: ${result.message}`);
    }
}

function renderAdminIssueTable() {
    const issues = backend.getIssues();
    const tbody = document.getElementById('issues-table-body');
    
    if (!tbody) return;

    tbody.innerHTML = issues.map(issue => `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${issue.title}</div>
                <div class="text-sm text-gray-500">ID: ${issue.id}</div>
            </td>
            <td class="px-6 py-4">
                <span style="${getCategoryBadgeStyle(issue.category)} padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500;">
                    ${issue.category}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">${issue.yesPrice}%</td>
            <td class="px-6 py-4 text-sm text-gray-900">${formatVolume(issue.totalVolume)} 감</td>
            <td class="px-6 py-4">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${issue.isPopular ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${issue.isPopular ? '인기' : '일반'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
                <button onclick="editIssue(${issue.id})" class="text-blue-600 hover:text-blue-900">수정</button>
                <button onclick="deleteIssue(${issue.id})" class="text-red-600 hover:text-red-900">삭제</button>
            </td>
        </tr>
    `).join('');
}

function addNewIssue(issue) {
    try {
        const issues = backend.getIssues();
        issues.push(issue);
        sessionStorage.setItem('poli-view-issues', JSON.stringify(issues));
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Global functions for onclick handlers
window.deleteIssue = function(issueId) {
    if (!confirm(MESSAGES.CONFIRM.DELETE_ISSUE)) return;
    
    try {
        const issues = backend.getIssues();
        const filteredIssues = issues.filter(issue => issue.id !== issueId);
        sessionStorage.setItem('poli-view-issues', JSON.stringify(filteredIssues));
        renderAdminIssueTable();
        alert(MESSAGES.SUCCESS.ISSUE_DELETED);
    } catch (error) {
        alert('이슈 삭제에 실패했습니다: ' + error.message);
    }
};

window.editIssue = function(issueId) {
    try {
        const issues = backend.getIssues();
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
            issue.isPopular = !issue.isPopular;
            sessionStorage.setItem('poli-view-issues', JSON.stringify(issues));
            renderAdminIssueTable();
            alert(`이슈가 ${issue.isPopular ? '인기' : '일반'} 이슈로 변경되었습니다.`);
        }
    } catch (error) {
        alert('이슈 수정에 실패했습니다: ' + error.message);
    }
};

function getCategoryBadgeStyle(category) {
    const categoryColors = {
        '정치': 'background: linear-gradient(135deg, #EF4444, #F87171); color: white;',
        '스포츠': 'background: linear-gradient(135deg, #06B6D4, #67E8F9); color: white;',
        '경제': 'background: linear-gradient(135deg, #10B981, #34D399); color: white;',
        '코인': 'background: linear-gradient(135deg, #F59E0B, #FBBF24); color: white;',
        '테크': 'background: linear-gradient(135deg, #8B5CF6, #A78BFA); color: white;',
        '엔터': 'background: linear-gradient(135deg, #EC4899, #F472B6); color: white;',
        '날씨': 'background: linear-gradient(135deg, #3B82F6, #60A5FA); color: white;',
        '해외': 'background: linear-gradient(135deg, #6366F1, #8B5CF6); color: white;'
    };
    
    return categoryColors[category] || 'background: #F3F4F6; color: #6B7280;';
}