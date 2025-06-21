import * as backend from '../backend.js';
import { APP_CONFIG, MESSAGES } from '../../config/constants.js';
import { getCategoryBadgeStyle } from '../ui/issue-card.js';
import { formatVolume } from '../../utils/formatters.js';

export async function renderAdminPage() {
    if (!checkAdminAccess()) {
        showAdminLogin();
        return;
    }
    await renderAdminIssueTable();
}

export function setupAdminFunctions() {
    setupCreateIssueModal();
}

function checkAdminAccess() {
    const adminToken = localStorage.getItem('yegame-admin-token');
    return adminToken && adminToken !== 'null';
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
                        <label class="block text-sm font-medium text-gray-700 mb-2">이메일</label>
                        <input type="email" id="admin-email" class="modern-input w-full" placeholder="관리자 이메일을 입력하세요" required>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                        <input type="password" id="admin-password" class="modern-input w-full" placeholder="비밀번호를 입력하세요" required>
                    </div>
                    <button type="submit" class="btn-primary w-full">로그인</button>
                    <div id="admin-login-error" class="hidden mt-3 text-red-600 text-sm text-center"></div>
                </form>
                
                <div class="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h3 class="text-sm font-medium text-blue-800 mb-2">💡 관리자 계정 생성 방법</h3>
                    <p class="text-xs text-blue-700">
                        서버에서 다음 명령어로 관리자 계정을 생성하세요:<br>
                        <code class="bg-blue-100 px-2 py-1 rounded text-xs">
                            node create-admin-user.js [이메일] [사용자명] [비밀번호]
                        </code>
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // 로딩 상태
    submitBtn.disabled = true;
    submitBtn.textContent = '로그인 중...';
    
    try {
        const response = await fetch('/api/admin-auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 관리자 토큰 저장 (서버에서 data.token으로 반환함)
            localStorage.setItem('yegame-admin-token', data.token);
            
            // 성공 메시지
            errorEl.textContent = '관리자 로그인 성공!';
            errorEl.className = 'mt-3 text-green-600 text-sm text-center';
            errorEl.classList.remove('hidden');
            
            // 관리자 페이지 렌더링
            setTimeout(async () => {
                await renderAdminPage();
            }, 1000);
        } else {
            errorEl.textContent = data.message || '로그인에 실패했습니다.';
            errorEl.className = 'mt-3 text-red-600 text-sm text-center';
            errorEl.classList.remove('hidden');
        }
    } catch (error) {
        console.error('관리자 로그인 오류:', error);
        errorEl.textContent = '서버 연결에 실패했습니다.';
        errorEl.className = 'mt-3 text-red-600 text-sm text-center';
        errorEl.classList.remove('hidden');
    } finally {
        // 로딩 상태 해제
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
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

async function handleCreateIssue(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const issueData = {
        title: formData.get('title'),
        category: formData.get('category'),
        description: formData.get('description') || '',
        end_date: formData.get('endDate'),
        yes_price: parseInt(formData.get('yesPrice')) || 50,
        image_url: formData.get('image_url') || null
    };

    try {
        const adminToken = localStorage.getItem('yegame-admin-token');
        const response = await fetch('/api/admin/issues', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(issueData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('이슈가 성공적으로 생성되었습니다!');
            closeModal(document.getElementById('create-issue-modal'), e.target);
            await renderAdminIssueTable();
        } else {
            // 인증 오류인 경우 로그인 화면으로 리디렉션
            if (response.status === 401) {
                localStorage.removeItem('yegame-admin-token');
                alert('인증이 만료되었습니다. 다시 로그인해주세요.');
                showAdminLogin();
                return;
            }
            alert(`이슈 생성에 실패했습니다: ${result.message}`);
        }
    } catch (error) {
        console.error('이슈 생성 오류:', error);
        alert('이슈 생성 중 오류가 발생했습니다.');
    }
}

async function renderAdminIssueTable() {
    try {
        const adminToken = localStorage.getItem('yegame-admin-token');
        const response = await fetch('/api/admin/issues', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        const data = await response.json();
        
        if (!data.success) {
            // 인증 오류인 경우 로그인 화면으로 리디렉션
            if (response.status === 401) {
                localStorage.removeItem('yegame-admin-token');
                showAdminLogin();
                return;
            }
            throw new Error(data.message || '데이터 로딩 실패');
        }
        
        const issues = data.issues;
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
    } catch (error) {
        console.error('데이터 로딩 중 오류가 발생했습니다:', error);
        const tbody = document.getElementById('issues-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-red-600">데이터 로딩 중 오류가 발생했습니다: ' + error.message + '</td></tr>';
        }
    }
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
window.deleteIssue = async function(issueId) {
    if (!confirm(MESSAGES.CONFIRM.DELETE_ISSUE)) return;
    
    try {
        const issues = backend.getIssues();
        const filteredIssues = issues.filter(issue => issue.id !== issueId);
        sessionStorage.setItem('poli-view-issues', JSON.stringify(filteredIssues));
        await renderAdminIssueTable();
        alert(MESSAGES.SUCCESS.ISSUE_DELETED);
    } catch (error) {
        alert('이슈 삭제에 실패했습니다: ' + error.message);
    }
};

window.editIssue = async function(issueId) {
    try {
        const issues = backend.getIssues();
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
            issue.isPopular = !issue.isPopular;
            sessionStorage.setItem('poli-view-issues', JSON.stringify(issues));
            await renderAdminIssueTable();
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

// 관리자 헤더 설정
function setupAdminHeader() {
    const logoutBtn = document.getElementById('admin-logout-btn');
    const profileBtn = document.getElementById('admin-profile-btn');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout);
    }
    
    if (profileBtn) {
        profileBtn.addEventListener('click', showAdminProfile);
    }
}

function handleAdminLogout() {
    if (confirm('정말 로그아웃 하시겠습니까?')) {
        localStorage.removeItem('yegame-admin-token');
        showAdminLogin();
    }
}

async function showAdminProfile() {
    try {
        const adminToken = localStorage.getItem('yegame-admin-token');
        const response = await fetch('/api/admin-auth/profile', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const admin = data.admin;
            alert(`관리자 정보:
이름: ${admin.username}
이메일: ${admin.email}
가입일: ${new Date(admin.memberSince).toLocaleDateString()}
관리자 등록일: ${new Date(admin.adminSince).toLocaleDateString()}`);
        } else {
            alert('프로필 정보를 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('프로필 조회 오류:', error);
        alert('프로필 정보 조회 중 오류가 발생했습니다.');
    }
}