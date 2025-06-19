// Complete working app with API integration
console.log('🚀 Working app starting...');

// Global state
let currentUser = null;
let issues = [];
let userToken = localStorage.getItem('yegame-token');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app...');
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Check authentication
    await checkAuthentication();
    
    // Initialize comments system
    initCommentsSystem();
    
    // Initialize the application based on current page
    const path = window.location.pathname.split("/").pop();
    console.log('Current page:', path);
    
    try {
        if (path === 'index.html' || path === '') {
            await initHomePage();
        } else if (path === 'login.html') {
            initLoginPage();
        } else if (path === 'admin.html') {
            await initAdminPage();
        } else if (path === 'issues.html') {
            await initIssuesPage();
        } else if (path === 'mypage.html') {
            await initMyPage();
        }
    } catch (error) {
        console.error('App initialization error:', error);
        showError('앱 초기화 중 오류가 발생했습니다.');
    }
});

// Authentication functions
async function checkAuthentication() {
    if (!userToken) {
        updateHeader(false);
        return;
    }
    
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.user) {
            currentUser = data.user;
            updateHeader(true);
            console.log('User authenticated:', currentUser.username);
        } else {
            // Invalid token, clear it
            localStorage.removeItem('yegame-token');
            userToken = null;
            updateHeader(false);
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('yegame-token');
        userToken = null;
        updateHeader(false);
    }
}

function updateHeader(isLoggedIn) {
    const userActionsContainer = document.getElementById('header-user-actions');
    if (!userActionsContainer) return;
    
    if (isLoggedIn && currentUser) {
        userActionsContainer.innerHTML = `
            <span class="text-sm font-medium text-gray-600 hidden sm:block">${currentUser.username}</span>
            <div class="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm">
                <i data-lucide="coins" class="w-4 h-4 text-yellow-500"></i>
                <span class="text-sm font-semibold text-gray-900">${(currentUser.gam_balance || currentUser.coins || 0).toLocaleString()}</span>
            </div>
            <button onclick="logout()" class="text-gray-600 hover:text-gray-900 transition-colors text-sm">로그아웃</button>
        `;
    } else {
        userActionsContainer.innerHTML = `
            <a href="login.html" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                로그인/회원가입
            </a>
        `;
    }
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function logout() {
    localStorage.removeItem('yegame-token');
    userToken = null;
    currentUser = null;
    alert('로그아웃되었습니다.');
    window.location.href = 'index.html';
}

// Home page functions
async function initHomePage() {
    console.log('Initializing home page...');
    
    showLoading('popular-issues-grid');
    
    try {
        // Load issues from API
        const response = await fetch('/api/issues');
        const data = await response.json();
        
        if (data.success) {
            issues = data.issues;
            console.log('Loaded', issues.length, 'issues');
            
            setupCategoryFilters();
            renderPopularIssues();
        } else {
            throw new Error(data.message || 'Failed to load issues');
        }
    } catch (error) {
        console.error('Failed to load issues:', error);
        showError('이슈를 불러오는데 실패했습니다.');
    }
}

function setupCategoryFilters() {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    
    // Extract unique categories from issues
    const categories = ['전체', ...new Set(issues.map(issue => issue.category))];
    
    filtersContainer.innerHTML = categories.map((category, index) => `
        <button class="category-filter-btn ${index === 0 ? 'active' : ''} px-4 py-2 rounded-full text-sm font-medium transition-colors
                       ${index === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
                data-category="${category}">
            ${category}
        </button>
    `).join('');
    
    // Add click handlers
    filtersContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.category-filter-btn');
        if (!button) return;
        
        // Update active state
        filtersContainer.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-100', 'text-gray-700');
        });
        
        button.classList.add('active', 'bg-blue-600', 'text-white');
        button.classList.remove('bg-gray-100', 'text-gray-700');
        
        const category = button.dataset.category;
        renderPopularIssues(category);
    });
}

// Comments System
let userLikedComments = new Set();

function initCommentsSystem() {
    // 댓글 토글 버튼 이벤트 리스너
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.comments-toggle-btn')) {
            const btn = e.target.closest('.comments-toggle-btn');
            const issueId = btn.dataset.issueId;
            await toggleComments(issueId);
        }
        
        // 좋아요 버튼
        if (e.target.closest('.comment-like-btn')) {
            const btn = e.target.closest('.comment-like-btn');
            const commentId = btn.dataset.commentId;
            await handleCommentLike(commentId, btn);
        }
        
        // 댓글 삭제 버튼
        if (e.target.closest('.comment-delete-btn')) {
            const btn = e.target.closest('.comment-delete-btn');
            const commentId = btn.dataset.commentId;
            await handleCommentDelete(commentId);
        }
        
        // 답글 버튼
        if (e.target.closest('.comment-reply-btn')) {
            const btn = e.target.closest('.comment-reply-btn');
            const commentId = btn.dataset.commentId;
            toggleReplyForm(commentId);
        }
    });
    
    // 댓글 폼 제출 이벤트
    document.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('comment-form')) {
            e.preventDefault();
            const form = e.target;
            const issueId = form.dataset.issueId;
            const parentId = form.dataset.parentId || null;
            await handleCommentSubmit(form, issueId, parentId);
        }
    });
}

async function toggleComments(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const toggleBtn = document.querySelector(`.comments-toggle-btn[data-issue-id="${issueId}"]`);
    const chevron = toggleBtn.querySelector('[data-lucide="chevron-down"]');
    
    if (commentsSection.classList.contains('hidden')) {
        commentsSection.classList.remove('hidden');
        chevron.classList.add('rotate-180');
        await loadComments(issueId);
        if (currentUser) {
            showCommentForm(issueId);
        }
    } else {
        commentsSection.classList.add('hidden');
        chevron.classList.remove('rotate-180');
    }
}

async function loadComments(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const loadingEl = commentsSection.querySelector('.comments-loading');
    const containerEl = commentsSection.querySelector('.comments-container');
    
    try {
        loadingEl.classList.remove('hidden');
        containerEl.classList.add('hidden');
        
        const response = await fetch(`/api/comments/issue/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            if (currentUser) {
                await loadUserLikeStatus(issueId);
            }
            containerEl.innerHTML = renderComments(data.comments);
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            loadingEl.classList.add('hidden');
            containerEl.classList.remove('hidden');
        } else {
            throw new Error(data.error || '댓글을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('댓글 로드 실패:', error);
        loadingEl.innerHTML = `
            <div class="text-center py-4 text-red-500">
                <i data-lucide="alert-circle" class="w-5 h-5 mx-auto mb-2"></i>
                <span>댓글을 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

async function loadUserLikeStatus(issueId) {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`/api/comments/likes/${currentUser.id}/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            userLikedComments = new Set(data.likedComments);
        }
    } catch (error) {
        console.error('좋아요 상태 로드 실패:', error);
    }
}

function renderComments(comments) {
    if (comments.length === 0) {
        return `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="message-circle" class="w-8 h-8 mx-auto mb-3 text-gray-300"></i>
                <p>첫 번째 댓글을 작성해보세요!</p>
            </div>
        `;
    }
    
    return comments.map(comment => renderComment(comment)).join('');
}

function renderComment(comment) {
    const isLiked = userLikedComments.has(comment.id);
    const isOwner = currentUser && currentUser.id === comment.user_id;
    const isHighlighted = comment.is_highlighted;
    
    let highlightClass = '';
    let highlightBadge = '';
    
    if (isHighlighted) {
        highlightClass = 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200';
        highlightBadge = `
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 font-medium">
                <i data-lucide="star" class="w-3 h-3 mr-1"></i>
                강조
            </span>
        `;
    }
    
    const repliesHtml = comment.replies ? comment.replies.map(reply => renderReply(reply)).join('') : '';
    
    return `
        <div class="comment ${highlightClass} border rounded-lg p-4 mb-4" data-comment-id="${comment.id}">
            <div class="flex items-start space-x-3 mb-3">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        ${comment.username.charAt(0).toUpperCase()}
                    </div>
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center space-x-2 mb-1">
                        <span class="font-medium text-gray-900">${comment.username}</span>
                        ${highlightBadge}
                        <span class="text-xs text-gray-500">${comment.timeAgo}</span>
                    </div>
                    <p class="text-gray-800 text-sm leading-relaxed">${comment.content}</p>
                </div>
            </div>
            
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    ${currentUser ? `
                        <button class="comment-like-btn flex items-center space-x-1 text-sm ${isLiked ? 'text-red-500' : 'text-gray-500'} hover:text-red-500 transition-colors" data-comment-id="${comment.id}">
                            <i data-lucide="heart" class="w-4 h-4 ${isLiked ? 'fill-current' : ''}"></i>
                            <span>${comment.likes || 0}</span>
                        </button>
                        <button class="comment-reply-btn text-sm text-gray-500 hover:text-blue-500 transition-colors" data-comment-id="${comment.id}">
                            <i data-lucide="reply" class="w-4 h-4 mr-1"></i>
                            답글
                        </button>
                    ` : ''}
                </div>
                
                ${isOwner ? `
                    <button class="comment-delete-btn text-xs text-red-500 hover:text-red-700 transition-colors" data-comment-id="${comment.id}">
                        <i data-lucide="trash-2" class="w-3 h-3 mr-1"></i>
                        삭제
                    </button>
                ` : ''}
            </div>
            
            <div class="reply-form-container hidden mt-4"></div>
            
            ${repliesHtml ? `
                <div class="replies-container mt-4 pl-8 border-l-2 border-gray-100">
                    ${repliesHtml}
                </div>
            ` : ''}
        </div>
    `;
}

function renderReply(reply) {
    const isLiked = userLikedComments.has(reply.id);
    const isOwner = currentUser && currentUser.id === reply.user_id;
    
    return `
        <div class="reply border-b border-gray-100 pb-3 mb-3 last:border-b-0 last:pb-0 last:mb-0" data-comment-id="${reply.id}">
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    <div class="w-6 h-6 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                        ${reply.username.charAt(0).toUpperCase()}
                    </div>
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center space-x-2 mb-1">
                        <span class="font-medium text-gray-900 text-sm">${reply.username}</span>
                        <span class="text-xs text-gray-500">${reply.timeAgo}</span>
                    </div>
                    <p class="text-gray-800 text-sm leading-relaxed">${reply.content}</p>
                    
                    <div class="flex items-center justify-between mt-2">
                        <div class="flex items-center space-x-3">
                            ${currentUser ? `
                                <button class="comment-like-btn flex items-center space-x-1 text-xs ${isLiked ? 'text-red-500' : 'text-gray-500'} hover:text-red-500 transition-colors" data-comment-id="${reply.id}">
                                    <i data-lucide="heart" class="w-3 h-3 ${isLiked ? 'fill-current' : ''}"></i>
                                    <span>${reply.likes || 0}</span>
                                </button>
                            ` : ''}
                        </div>
                        
                        ${isOwner ? `
                            <button class="comment-delete-btn text-xs text-red-500 hover:text-red-700 transition-colors" data-comment-id="${reply.id}">
                                <i data-lucide="trash-2" class="w-3 h-3 mr-1"></i>
                                삭제
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function showCommentForm(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const formContainer = commentsSection.querySelector('.comment-form-container');
    
    formContainer.innerHTML = `
        <form class="comment-form bg-gray-50 rounded-lg p-4" data-issue-id="${issueId}">
            <textarea 
                name="content" 
                placeholder="이 이슈에 대한 의견을 남겨보세요..." 
                class="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="3"
                maxlength="500"
                required
            ></textarea>
            <div class="flex items-center justify-between mt-3">
                <span class="text-xs text-gray-500">
                    <span class="character-count">0</span> / 500자
                </span>
                <div class="flex items-center space-x-2">
                    <button type="button" class="cancel-comment text-sm text-gray-500 hover:text-gray-700 transition-colors">
                        취소
                    </button>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        댓글 작성
                    </button>
                </div>
            </div>
        </form>
    `;
    
    formContainer.classList.remove('hidden');
    
    const textarea = formContainer.querySelector('textarea');
    const charCount = formContainer.querySelector('.character-count');
    
    textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length;
    });
    
    formContainer.querySelector('.cancel-comment').addEventListener('click', () => {
        formContainer.classList.add('hidden');
    });
    
    textarea.focus();
}

function toggleReplyForm(commentId) {
    const comment = document.querySelector(`[data-comment-id="${commentId}"]`);
    const replyContainer = comment.querySelector('.reply-form-container');
    
    if (replyContainer.classList.contains('hidden')) {
        const issueId = comment.closest('.comments-section').dataset.issueId;
        
        replyContainer.innerHTML = `
            <form class="comment-form bg-blue-50 rounded-lg p-3" data-issue-id="${issueId}" data-parent-id="${commentId}">
                <textarea 
                    name="content" 
                    placeholder="답글을 작성하세요..." 
                    class="w-full p-2 border border-blue-200 rounded resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    rows="2"
                    maxlength="500"
                    required
                ></textarea>
                <div class="flex items-center justify-between mt-2">
                    <span class="text-xs text-gray-500">
                        <span class="character-count">0</span> / 500자
                    </span>
                    <div class="flex items-center space-x-2">
                        <button type="button" class="cancel-reply text-xs text-gray-500 hover:text-gray-700 transition-colors">
                            취소
                        </button>
                        <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors">
                            답글 작성
                        </button>
                    </div>
                </div>
            </form>
        `;
        
        replyContainer.classList.remove('hidden');
        
        const textarea = replyContainer.querySelector('textarea');
        const charCount = replyContainer.querySelector('.character-count');
        
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
        
        replyContainer.querySelector('.cancel-reply').addEventListener('click', () => {
            replyContainer.classList.add('hidden');
        });
        
        textarea.focus();
    } else {
        replyContainer.classList.add('hidden');
    }
}

async function handleCommentSubmit(form, issueId, parentId = null) {
    const formData = new FormData(form);
    const content = formData.get('content').trim();
    
    if (!content) return;
    
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn.textContent;
    
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '작성 중...';
        
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id,
                issueId: parseInt(issueId),
                content: content,
                parentId: parentId ? parseInt(parentId) : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadComments(issueId);
            form.reset();
            
            if (parentId) {
                form.closest('.reply-form-container').classList.add('hidden');
            }
            
            showNotification('댓글이 작성되었습니다.', 'success');
        } else {
            throw new Error(data.error || '댓글 작성에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 작성 실패:', error);
        showNotification(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function handleCommentLike(commentId, btn) {
    if (!currentUser) {
        showNotification('로그인이 필요합니다.', 'error');
        return;
    }
    
    const isLiked = userLikedComments.has(parseInt(commentId));
    const action = isLiked ? 'unlike' : 'like';
    
    try {
        const response = await fetch(`/api/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id,
                action: action
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const heartIcon = btn.querySelector('[data-lucide="heart"]');
            const countSpan = btn.querySelector('span');
            
            if (action === 'like') {
                userLikedComments.add(parseInt(commentId));
                btn.classList.remove('text-gray-500');
                btn.classList.add('text-red-500');
                heartIcon.classList.add('fill-current');
                countSpan.textContent = parseInt(countSpan.textContent) + 1;
            } else {
                userLikedComments.delete(parseInt(commentId));
                btn.classList.remove('text-red-500');
                btn.classList.add('text-gray-500');
                heartIcon.classList.remove('fill-current');
                countSpan.textContent = parseInt(countSpan.textContent) - 1;
            }
        } else {
            throw new Error(data.error || '좋아요 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('좋아요 처리 실패:', error);
        showNotification(error.message, 'error');
    }
}

async function handleCommentDelete(commentId) {
    if (!confirm('정말로 이 댓글을 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
            const issueId = commentEl.closest('.comments-section').dataset.issueId;
            
            await loadComments(issueId);
            showNotification('댓글이 삭제되었습니다.', 'success');
        } else {
            throw new Error(data.error || '댓글 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 삭제 실패:', error);
        showNotification(error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all duration-300 transform translate-x-full opacity-0 ${
        type === 'success' ? 'bg-green-500' : 
        type === 'error' ? 'bg-red-500' : 
        'bg-blue-500'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.classList.remove('translate-x-full', 'opacity-0');
    });
    
    setTimeout(() => {
        notification.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

function renderPopularIssues(categoryFilter = '전체') {
    const grid = document.getElementById('popular-issues-grid');
    if (!grid) return;
    
    let filteredIssues = issues;
    
    if (categoryFilter !== '전체') {
        filteredIssues = issues.filter(issue => issue.category === categoryFilter);
    } else {
        // Show popular issues or first few issues
        filteredIssues = issues.filter(issue => issue.isPopular || issue.is_popular).slice(0, 6);
        if (filteredIssues.length === 0) {
            filteredIssues = issues.slice(0, 6);
        }
    }
    
    if (filteredIssues.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-gray-500">해당 카테고리에 이슈가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredIssues.map(issue => createIssueCard(issue)).join('');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function createIssueCard(issue) {
    const yesPrice = issue.yesPercentage || issue.yes_price || 50;
    const noPrice = 100 - yesPrice;
    const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
    const volume = issue.total_volume || issue.totalVolume || 0;
    
    return `
        <div class="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
            <div class="flex justify-between items-start mb-4">
                <span class="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    ${issue.category}
                </span>
                <span class="text-xs text-gray-500 flex items-center">
                    <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
                    ${timeLeft}
                </span>
            </div>
            
            <h3 class="text-lg font-semibold text-gray-900 mb-4 leading-tight">
                ${issue.title}
            </h3>
            
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center space-x-2">
                    <span class="text-sm font-medium text-green-600">Yes</span>
                    <span class="text-lg font-bold text-green-600">${yesPrice}%</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-lg font-bold text-red-500">${noPrice}%</span>
                    <span class="text-sm font-medium text-red-500">No</span>
                </div>
            </div>
            
            <div class="relative mb-6">
                <div class="w-full bg-gradient-to-r from-green-500 to-red-500 rounded-full h-2 mb-2">
                    <div class="absolute top-[-2px] bg-white border-2 border-blue-500 rounded-full w-3 h-3" 
                         style="left: calc(${yesPrice}% - 6px)"></div>
                </div>
            </div>
            
            <div class="flex space-x-3 mb-4">
                <button class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                        onclick="placeBet(${issue.id}, 'Yes')">
                    Yes ${yesPrice}%
                </button>
                <button class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                        onclick="placeBet(${issue.id}, 'No')">
                    No ${noPrice}%
                </button>
            </div>
            
            <div class="pt-4 border-t border-gray-200 flex justify-between items-center">
                <span class="text-sm text-gray-600">총 참여 감</span>
                <span class="font-semibold text-gray-900 flex items-center">
                    <i data-lucide="coins" class="w-4 h-4 mr-1 text-yellow-500"></i>
                    ${formatVolume(volume)}
                </span>
            </div>
            
            <!-- Comments Section -->
            <div class="pt-4 border-t border-gray-200 mt-4">
                <button class="comments-toggle-btn w-full flex items-center justify-center space-x-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors" data-issue-id="${issue.id}">
                    <i data-lucide="message-circle" class="w-4 h-4 text-gray-600"></i>
                    <span class="text-sm font-medium text-gray-700">토론 참여하기</span>
                    <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 transform transition-transform"></i>
                </button>
                <div class="comments-section hidden mt-4" data-issue-id="${issue.id}">
                    <div class="comments-loading text-center py-4 text-gray-500">
                        <i data-lucide="loader" class="w-5 h-5 animate-spin mx-auto mb-2"></i>
                        <span>댓글을 불러오는 중...</span>
                    </div>
                    <div class="comments-container hidden"></div>
                    <div class="comment-form-container hidden"></div>
                </div>
            </div>
        </div>
    `;
}

// Betting function
async function placeBet(issueId, choice) {
    if (!currentUser) {
        alert('예측을 하려면 로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    
    const amount = prompt(`'${choice}'에 얼마나 예측하시겠습니까?\\n보유 감: ${(currentUser.gam_balance || currentUser.coins || 0).toLocaleString()}`, "1000");
    
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
        return;
    }
    
    const betAmount = parseInt(amount);
    
    if (betAmount > (currentUser.gam_balance || currentUser.coins || 0)) {
        alert('보유 감이 부족합니다.');
        return;
    }
    
    try {
        const response = await fetch('/api/bets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                userId: currentUser.id,
                issueId: issueId,
                choice: choice,
                amount: betAmount
            })
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            alert('예측이 완료되었습니다!');
            
            // Update user balance
            if (data.currentBalance !== undefined) {
                currentUser.gam_balance = data.currentBalance;
                currentUser.coins = data.currentBalance;
                updateHeader(true);
            }
            
            // Refresh issues
            await initHomePage();
        } else {
            alert(data.error || data.message || '예측에 실패했습니다.');
        }
    } catch (error) {
        console.error('Betting failed:', error);
        alert('예측 처리 중 오류가 발생했습니다.');
    }
}

// Login page functions
function initLoginPage() {
    console.log('Initializing login page...');
    
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    // Setup tab switching
    setupLoginTabs();
}

function setupLoginTabs() {
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    
    if (loginTab && signupTab && loginSection && signupSection) {
        loginTab.addEventListener('click', () => {
            switchTab(loginTab, signupTab, loginSection, signupSection);
        });
        
        signupTab.addEventListener('click', () => {
            switchTab(signupTab, loginTab, signupSection, loginSection);
        });
    }
}

function switchTab(activeTab, inactiveTab, activeSection, inactiveSection) {
    activeTab.classList.add('border-blue-500', 'text-blue-600');
    activeTab.classList.remove('border-transparent', 'text-gray-500');
    inactiveTab.classList.add('border-transparent', 'text-gray-500');
    inactiveTab.classList.remove('border-blue-500', 'text-blue-600');
    activeSection.classList.remove('hidden');
    inactiveSection.classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = e.target.email.value;
    const password = e.target.password.value;
    const errorEl = document.getElementById('login-error');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success && data.token) {
            localStorage.setItem('yegame-token', data.token);
            userToken = data.token;
            currentUser = data.user;
            
            alert(data.message || '로그인 성공!');
            window.location.href = 'index.html';
        } else {
            showLoginError(errorEl, data.message || '로그인에 실패했습니다.');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showLoginError(errorEl, '로그인 처리 중 오류가 발생했습니다.');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    const confirmPassword = e.target.confirmPassword.value;
    const errorEl = document.getElementById('signup-error');
    
    if (password !== confirmPassword) {
        showLoginError(errorEl, '비밀번호가 일치하지 않습니다.');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.token) {
                localStorage.setItem('yegame-token', data.token);
                userToken = data.token;
                currentUser = data.user;
            }
            
            alert(data.message || '회원가입이 완료되었습니다!');
            window.location.href = 'index.html';
        } else {
            showLoginError(errorEl, data.message || '회원가입에 실패했습니다.');
        }
    } catch (error) {
        console.error('Signup failed:', error);
        showLoginError(errorEl, '회원가입 처리 중 오류가 발생했습니다.');
    }
}

function showLoginError(errorEl, message) {
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

// Admin page functions
async function initAdminPage() {
    console.log('Initializing admin page...');
    
    // Check admin access
    if (!checkAdminAccess()) {
        showAdminLogin();
        return;
    }
    
    // Setup admin page UI events
    setupAdminPageEvents();
    setupAdminTabs();
    await loadAdminIssues();
    setupCreateIssueForm();
}

function setupAdminPageEvents() {
    // 새 이슈 생성 버튼
    const createBtn = document.getElementById('create-issue-btn');
    const modal = document.getElementById('create-issue-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    
    if (createBtn && modal) {
        createBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }
    
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            // Reset form and image upload UI
            document.getElementById('create-issue-form')?.reset();
            document.getElementById('image-preview').classList.add('hidden');
            document.getElementById('upload-area').classList.remove('hidden');
            document.getElementById('image-url').value = '';
        });
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            // Reset form and image upload UI
            document.getElementById('create-issue-form')?.reset();
            document.getElementById('image-preview').classList.add('hidden');
            document.getElementById('upload-area').classList.remove('hidden');
            document.getElementById('image-url').value = '';
        });
    }
    
    // 모달 배경 클릭 시 닫기
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
    
    // 이슈 수정 모달 이벤트
    const editModal = document.getElementById('edit-issue-modal');
    const editCloseBtn = document.getElementById('close-edit-modal-btn');
    const editCancelBtn = document.getElementById('edit-cancel-btn');
    
    if (editCloseBtn && editModal) {
        editCloseBtn.addEventListener('click', () => {
            editModal.classList.add('hidden');
        });
    }
    
    if (editCancelBtn && editModal) {
        editCancelBtn.addEventListener('click', () => {
            editModal.classList.add('hidden');
        });
    }
    
    // 수정 모달 배경 클릭 시 닫기
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                editModal.classList.add('hidden');
            }
        });
    }
    
    // 이미지 업로드 이벤트 설정
    setupImageUpload();
    setupEditImageUpload();
}

// 관리자 탭 설정
function setupAdminTabs() {
    const issuesTab = document.getElementById('issues-tab');
    const commentsTab = document.getElementById('comments-tab');
    const issuesSection = document.getElementById('issues-section');
    const commentsSection = document.getElementById('comments-section');
    const createBtn = document.getElementById('create-issue-btn');
    
    if (!issuesTab || !commentsTab) return;
    
    issuesTab.addEventListener('click', () => {
        switchAdminTab(issuesTab, commentsTab, issuesSection, commentsSection, createBtn, true);
    });
    
    commentsTab.addEventListener('click', () => {
        switchAdminTab(commentsTab, issuesTab, commentsSection, issuesSection, createBtn, false);
        loadAdminComments();
    });
    
    // 댓글 관리 이벤트
    setupCommentManagementEvents();
}

function switchAdminTab(activeTab, inactiveTab, activeSection, inactiveSection, createBtn, showCreateBtn) {
    // 탭 스타일 변경
    activeTab.className = 'admin-tab active pb-4 border-b-2 border-blue-500 text-blue-600 font-medium';
    inactiveTab.className = 'admin-tab pb-4 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium';
    
    // 섹션 표시/숨김
    activeSection.classList.remove('hidden');
    inactiveSection.classList.add('hidden');
    
    // 새 이슈 생성 버튼 표시/숨김
    if (createBtn) {
        if (showCreateBtn) {
            createBtn.classList.remove('hidden');
        } else {
            createBtn.classList.add('hidden');
        }
    }
}

function setupCommentManagementEvents() {
    // 댓글 필터 변경
    const commentFilter = document.getElementById('comment-filter');
    if (commentFilter) {
        commentFilter.addEventListener('change', () => {
            loadAdminComments();
        });
    }
    
    // 새로고침 버튼
    const refreshBtn = document.getElementById('refresh-comments');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAdminComments();
        });
    }
    
    // 댓글 액션 이벤트 (이벤트 위임)
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.admin-delete-comment')) {
            const btn = e.target.closest('.admin-delete-comment');
            const commentId = btn.dataset.commentId;
            await handleAdminDeleteComment(commentId);
        }
        
        if (e.target.closest('.admin-highlight-comment')) {
            const btn = e.target.closest('.admin-highlight-comment');
            const commentId = btn.dataset.commentId;
            const action = btn.dataset.action;
            await handleAdminHighlightComment(commentId, action);
        }
    });
}

async function loadAdminComments() {
    const tbody = document.getElementById('comments-table-body');
    const loadingEl = document.getElementById('comments-loading');
    const emptyEl = document.getElementById('comments-empty');
    const filterSelect = document.getElementById('comment-filter');
    
    if (!tbody || !loadingEl || !emptyEl) return;
    
    try {
        loadingEl.classList.remove('hidden');
        tbody.classList.add('hidden');
        emptyEl.classList.add('hidden');
        
        const filter = filterSelect ? filterSelect.value : 'all';
        const response = await fetch(`/api/admin/comments/all?filter=${filter}&limit=100`);
        const data = await response.json();
        
        if (data.success) {
            if (data.comments.length === 0) {
                loadingEl.classList.add('hidden');
                emptyEl.classList.remove('hidden');
                return;
            }
            
            tbody.innerHTML = data.comments.map(comment => renderAdminCommentRow(comment)).join('');
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            
            loadingEl.classList.add('hidden');
            tbody.classList.remove('hidden');
        } else {
            throw new Error(data.error || '댓글을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('관리자 댓글 로드 실패:', error);
        loadingEl.innerHTML = `
            <div class="flex items-center justify-center py-8 text-red-500">
                <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                <span>댓글을 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

function renderAdminCommentRow(comment) {
    const statusBadge = comment.isDeleted ? 
        '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">삭제됨</span>' :
        comment.is_highlighted ? 
        '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">강조됨</span>' :
        '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">정상</span>';
    
    const actions = comment.isDeleted ? 
        '' : // 삭제된 댓글은 액션 버튼 없음
        `<div class="flex items-center space-x-2">
            ${!comment.is_highlighted ? 
                `<button class="admin-highlight-comment text-xs text-yellow-600 hover:text-yellow-700" data-comment-id="${comment.id}" data-action="highlight">강조</button>` :
                `<button class="admin-highlight-comment text-xs text-gray-600 hover:text-gray-700" data-comment-id="${comment.id}" data-action="unhighlight">강조해제</button>`
            }
            <button class="admin-delete-comment text-xs text-red-600 hover:text-red-700" data-comment-id="${comment.id}">삭제</button>
        </div>`;
    
    return `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900 max-w-xs truncate" title="${comment.content}">
                    ${comment.contentPreview}
                </div>
                ${comment.parent_id ? '<div class="text-xs text-gray-500 mt-1">↳ 답글</div>' : ''}
                ${comment.reply_count > 0 ? `<div class="text-xs text-blue-600 mt-1">${comment.reply_count}개 답글</div>` : ''}
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${comment.username}</div>
                <div class="text-xs text-gray-500">ID: ${comment.user_id}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900 max-w-xs truncate" title="${comment.issue_title}">
                    ${comment.issue_title}
                </div>
                <div class="text-xs text-gray-500">ID: ${comment.issue_id}</div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
                <div class="flex items-center">
                    <i data-lucide="heart" class="w-4 h-4 mr-1 ${comment.likes > 0 ? 'text-red-500' : 'text-gray-400'}"></i>
                    ${comment.likes}
                </div>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${comment.timeAgo}</td>
            <td class="px-6 py-4">${actions}</td>
        </tr>
    `;
}

async function handleAdminDeleteComment(commentId) {
    if (!confirm('정말로 이 댓글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('댓글이 삭제되었습니다.', 'success');
            await loadAdminComments();
        } else {
            throw new Error(data.error || '댓글 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('관리자 댓글 삭제 실패:', error);
        showNotification(error.message, 'error');
    }
}

async function handleAdminHighlightComment(commentId, action) {
    try {
        const response = await fetch(`/api/admin/comments/${commentId}/highlight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            await loadAdminComments();
        } else {
            throw new Error(data.error || '댓글 강조 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('관리자 댓글 강조 처리 실패:', error);
        showNotification(error.message, 'error');
    }
}

function checkAdminAccess() {
    // 관리자 접근을 위해서는 사용자 로그인도 필요
    return sessionStorage.getItem('admin-auth') === 'authenticated' && userToken;
}

function showAdminLogin() {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;
    
    // 사용자 로그인 상태 확인
    if (!userToken) {
        mainContent.innerHTML = `
            <div class="max-w-md mx-auto mt-16">
                <div class="bg-white rounded-lg shadow-lg p-8">
                    <h2 class="text-2xl font-bold text-center mb-6">관리자 접근 오류</h2>
                    <p class="text-center text-gray-600 mb-4">관리자 기능을 사용하려면 먼저 사용자 로그인이 필요합니다.</p>
                    <a href="login.html" class="w-full block bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-center">로그인하러 가기</a>
                </div>
            </div>
        `;
        return;
    }
    
    mainContent.innerHTML = `
        <div class="max-w-md mx-auto mt-16">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h2 class="text-2xl font-bold text-center mb-6">관리자 로그인</h2>
                <p class="text-center text-gray-600 mb-4">사용자: <strong>${currentUser?.username || '알 수 없음'}</strong></p>
                <form id="admin-login-form">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">관리자 암호</label>
                        <input type="password" id="admin-password" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="관리자 암호를 입력하세요" required>
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">로그인</button>
                    <div id="admin-login-error" class="hidden mt-3 text-red-600 text-sm text-center"></div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        const errorEl = document.getElementById('admin-login-error');
        
        if (password === 'admin123') {
            sessionStorage.setItem('admin-auth', 'authenticated');
            setupAdminPageEvents();
            await loadAdminIssues();
            setupCreateIssueForm();
        } else {
            errorEl.textContent = '잘못된 관리자 암호입니다.';
            errorEl.classList.remove('hidden');
        }
    });
}

async function loadAdminIssues() {
    try {
        const response = await fetch('/api/issues');
        const data = await response.json();
        
        if (data.success) {
            issues = data.issues;
            renderAdminIssueTable();
        }
    } catch (error) {
        console.error('Failed to load admin issues:', error);
    }
}

function renderAdminIssueTable() {
    const tbody = document.getElementById('issues-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = issues.map(issue => `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${issue.title}</div>
                <div class="text-sm text-gray-500">ID: ${issue.id}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    ${issue.category}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">${issue.yesPercentage || issue.yes_price || 50}%</td>
            <td class="px-6 py-4 text-sm text-gray-900">${formatVolume(issue.total_volume || issue.totalVolume || 0)} 감</td>
            <td class="px-6 py-4">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${(issue.isPopular || issue.is_popular) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${(issue.isPopular || issue.is_popular) ? '인기' : '일반'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
                <button onclick="editIssue(${issue.id})" class="text-blue-600 hover:text-blue-900">수정</button>
                <button onclick="deleteIssue(${issue.id})" class="text-red-600 hover:text-red-900">삭제</button>
            </td>
        </tr>
    `).join('');
}

function setupCreateIssueForm() {
    const form = document.getElementById('create-issue-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = e.target.title.value;
        const category = e.target.category.value;
        const endDate = e.target.endDate.value;
        const description = e.target.description.value;
        const imageUrl = e.target.imageUrl.value;
        const yesPrice = e.target.yesPrice.value;
        const isPopular = e.target.isPopular.checked;
        
        try {
            const response = await fetch('/api/issues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    title,
                    category,
                    endDate,
                    description,
                    imageUrl,
                    yesPrice: parseInt(yesPrice) || 50,
                    isPopular
                })
            });
            
            const data = await response.json();
            
            if (data.success || response.ok) {
                alert('이슈가 성공적으로 생성되었습니다!');
                e.target.reset();
                document.getElementById('create-issue-modal').classList.add('hidden');
                // Reset image upload UI
                document.getElementById('image-preview').classList.add('hidden');
                document.getElementById('upload-area').classList.remove('hidden');
                document.getElementById('image-url').value = '';
                await loadAdminIssues();
            } else {
                alert(data.message || '이슈 생성에 실패했습니다.');
            }
        } catch (error) {
            console.error('Issue creation failed:', error);
            alert('이슈 생성 중 오류가 발생했습니다.');
        }
    });
    
    // Edit form setup
    const editForm = document.getElementById('edit-issue-form');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const issueId = e.target.issueId.value;
            const title = e.target.title.value;
            const category = e.target.category.value;
            const endDate = e.target.endDate.value;
            const description = e.target.description.value;
            const imageUrl = e.target.imageUrl.value;
            const yesPrice = e.target.yesPrice.value;
            const isPopular = e.target.isPopular.checked;
            
            try {
                const response = await fetch(`/api/issues/${issueId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify({
                        title,
                        category,
                        endDate,
                        description,
                        imageUrl,
                        yesPrice: parseInt(yesPrice),
                        isPopular
                    })
                });
                
                const data = await response.json();
                
                if (data.success || response.ok) {
                    alert('이슈가 성공적으로 수정되었습니다!');
                    document.getElementById('edit-issue-modal').classList.add('hidden');
                    await loadAdminIssues();
                } else {
                    alert(data.message || '이슈 수정에 실패했습니다.');
                }
            } catch (error) {
                console.error('Issue update failed:', error);
                alert('이슈 수정 중 오류가 발생했습니다.');
            }
        });
    }
}

// Image upload functions
function setupImageUpload() {
    const fileInput = document.getElementById('issue-image');
    const previewContainer = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const uploadArea = document.getElementById('upload-area');
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = progressContainer?.querySelector('.bg-blue-600');
    const removeBtn = document.getElementById('remove-image');
    const imageUrlInput = document.getElementById('image-url');
    
    if (!fileInput) return;
    
    fileInput.addEventListener('change', handleImageUpload);
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            fileInput.value = '';
            imageUrlInput.value = '';
            previewContainer.classList.add('hidden');
            uploadArea.classList.remove('hidden');
        });
    }
    
    async function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Show progress
        uploadArea.classList.add('hidden');
        progressContainer.classList.remove('hidden');
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/api/upload/image', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                imageUrlInput.value = data.imageUrl;
                previewImg.src = data.imageUrl;
                previewContainer.classList.remove('hidden');
                progressContainer.classList.add('hidden');
            } else {
                throw new Error(data.error || '업로드 실패');
            }
        } catch (error) {
            console.error('Image upload failed:', error);
            alert('이미지 업로드에 실패했습니다: ' + error.message);
            uploadArea.classList.remove('hidden');
            progressContainer.classList.add('hidden');
            fileInput.value = '';
        }
    }
}

function setupEditImageUpload() {
    const fileInput = document.getElementById('edit-issue-image');
    const previewContainer = document.getElementById('edit-image-preview');
    const previewImg = document.getElementById('edit-preview-img');
    const uploadArea = document.getElementById('edit-upload-area');
    const progressContainer = document.getElementById('edit-upload-progress');
    const progressBar = progressContainer?.querySelector('.bg-blue-600');
    const removeBtn = document.getElementById('edit-remove-image');
    const imageUrlInput = document.getElementById('edit-image-url');
    
    if (!fileInput) return;
    
    fileInput.addEventListener('change', handleEditImageUpload);
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            fileInput.value = '';
            imageUrlInput.value = '';
            previewContainer.classList.add('hidden');
            uploadArea.classList.remove('hidden');
        });
    }
    
    async function handleEditImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Show progress
        uploadArea.classList.add('hidden');
        progressContainer.classList.remove('hidden');
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/api/upload/image', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                imageUrlInput.value = data.imageUrl;
                previewImg.src = data.imageUrl;
                previewContainer.classList.remove('hidden');
                progressContainer.classList.add('hidden');
            } else {
                throw new Error(data.error || '업로드 실패');
            }
        } catch (error) {
            console.error('Image upload failed:', error);
            alert('이미지 업로드에 실패했습니다: ' + error.message);
            uploadArea.classList.remove('hidden');
            progressContainer.classList.add('hidden');
            fileInput.value = '';
        }
    }
}

// Global functions
async function editIssue(issueId) {
    try {
        // Find the issue data
        const issue = issues.find(i => i.id === issueId);
        if (!issue) {
            alert('이슈를 찾을 수 없습니다.');
            return;
        }
        
        // Populate the edit form
        document.getElementById('edit-issue-id').value = issue.id;
        document.getElementById('edit-issue-title').value = issue.title;
        document.getElementById('edit-issue-category').value = issue.category;
        document.getElementById('edit-issue-description').value = issue.description || '';
        document.getElementById('edit-issue-yes-price').value = issue.yes_price || issue.yesPrice || 50;
        document.getElementById('edit-issue-popular').checked = issue.is_popular || issue.isPopular || false;
        
        // Format end date for datetime-local input
        const endDate = new Date(issue.end_date || issue.endDate);
        if (!isNaN(endDate.getTime())) {
            const year = endDate.getFullYear();
            const month = String(endDate.getMonth() + 1).padStart(2, '0');
            const day = String(endDate.getDate()).padStart(2, '0');
            const hours = String(endDate.getHours()).padStart(2, '0');
            const minutes = String(endDate.getMinutes()).padStart(2, '0');
            document.getElementById('edit-issue-end-date').value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        
        // Handle existing image
        const imageUrl = issue.image_url || issue.imageUrl;
        if (imageUrl) {
            document.getElementById('edit-image-url').value = imageUrl;
            document.getElementById('edit-preview-img').src = imageUrl;
            document.getElementById('edit-image-preview').classList.remove('hidden');
            document.getElementById('edit-upload-area').classList.add('hidden');
        } else {
            document.getElementById('edit-image-url').value = '';
            document.getElementById('edit-image-preview').classList.add('hidden');
            document.getElementById('edit-upload-area').classList.remove('hidden');
        }
        
        // Show the edit modal
        document.getElementById('edit-issue-modal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Failed to open edit modal:', error);
        alert('이슈 수정 화면을 열 수 없습니다.');
    }
}

async function deleteIssue(issueId) {
    if (!confirm('정말로 이 이슈를 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            alert('이슈가 삭제되었습니다.');
            await loadAdminIssues();
        } else {
            alert(data.message || '이슈 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('Issue deletion failed:', error);
        alert('이슈 삭제 중 오류가 발생했습니다.');
    }
}

// Utility functions
function getTimeLeft(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    
    if (diff <= 0) return "마감";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    
    if (days > 0) return `${days}일 남음`;
    if (hours > 0) return `${hours}시간 남음`;
    return "곧 마감";
}

function formatVolume(volume) {
    if (volume >= 100000000) {
        return `${(volume / 100000000).toFixed(1)}억`;
    }
    if (volume >= 10000) {
        return `${(volume / 10000).toFixed(0)}만`;
    }
    return volume.toLocaleString();
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-blue-600 rounded-full"></div>
                <p class="mt-4 text-gray-600">로딩 중...</p>
            </div>
        `;
    }
}

function showError(message) {
    const grid = document.getElementById('popular-issues-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-red-600">${message}</p>
                <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md">다시 시도</button>
            </div>
        `;
    }
}

// OAuth functions (placeholder)
function loginWithGoogle() {
    alert('Google 로그인은 현재 설정 중입니다. 이메일로 로그인해주세요.');
}

function loginWithGithub() {
    alert('GitHub 로그인은 현재 설정 중입니다. 이메일로 로그인해주세요.');
}

// Placeholder functions for other pages
async function initIssuesPage() {
    console.log('Issues page - redirecting to home');
    window.location.href = 'index.html';
}

async function initMyPage() {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    console.log('My page functionality coming soon');
}

console.log('✅ Working app script loaded successfully');