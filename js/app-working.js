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
// Global state for home page
let allIssues = [];
let currentPage = 1;
let currentCategory = '전체';
let currentSort = 'newest';
let currentSearch = '';
let isLoading = false;

async function initHomePage() {
    console.log('Initializing unified home page...');
    
    try {
        // Load issues from API
        const response = await fetch('/api/issues');
        const data = await response.json();
        
        if (data.success) {
            allIssues = data.issues;
            issues = data.issues; // Keep for backward compatibility
            console.log('Loaded', allIssues.length, 'issues');
            
            setupCategoryFilters();
            setupHomePageEvents();
            setupScrollToTop();
            renderPopularIssues();
            renderAllIssues();
            
            // Handle anchor links
            if (window.location.hash === '#all-issues') {
                setTimeout(() => {
                    document.getElementById('all-issues-section').scrollIntoView({ 
                        behavior: 'smooth' 
                    });
                }, 500);
            }
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
    
    // Define all categories with their colors
    const categoryColors = {
        '전체': 'background: linear-gradient(135deg, #6B7280, #9CA3AF); color: white;',
        '정치': 'background: linear-gradient(135deg, #EF4444, #F87171); color: white;',
        '스포츠': 'background: linear-gradient(135deg, #06B6D4, #67E8F9); color: white;',
        '경제': 'background: linear-gradient(135deg, #10B981, #34D399); color: white;',
        '코인': 'background: linear-gradient(135deg, #F59E0B, #FBBF24); color: white;',
        '테크': 'background: linear-gradient(135deg, #8B5CF6, #A78BFA); color: white;',
        '엔터': 'background: linear-gradient(135deg, #EC4899, #F472B6); color: white;',
        '날씨': 'background: linear-gradient(135deg, #3B82F6, #60A5FA); color: white;',
        '해외': 'background: linear-gradient(135deg, #6366F1, #8B5CF6); color: white;'
    };
    
    const categories = ['전체', '정치', '스포츠', '경제', '코인', '테크', '엔터', '날씨', '해외'];
    
    filtersContainer.innerHTML = categories.map((category, index) => `
        <button class="category-filter-btn ${index === 0 ? 'active' : ''} px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                style="${index === 0 ? categoryColors['전체'] : categoryColors[category]}"
                data-category="${category}">
            ${category}
        </button>
    `).join('');
    
    // Add click events to category filters
    filtersContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-filter-btn')) {
            const category = e.target.dataset.category;
            selectCategory(category, e.target);
        }
    });
}

function selectCategory(category, buttonElement) {
    // Update active state
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '0.7';
        btn.style.transform = 'scale(1)';
    });
    
    buttonElement.classList.add('active');
    buttonElement.style.opacity = '1';
    buttonElement.style.transform = 'scale(1.05)';
    
    currentCategory = category;
    currentPage = 1;
    renderAllIssues();
}

function setupHomePageEvents() {
    // Scroll to all issues button
    const scrollBtn = document.getElementById('scroll-to-all-issues');
    if (scrollBtn) {
        scrollBtn.addEventListener('click', () => {
            document.getElementById('all-issues-section').scrollIntoView({ 
                behavior: 'smooth' 
            });
        });
    }
    
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            currentSearch = e.target.value.trim();
            currentPage = 1;
            renderAllIssues();
        }, 300));
    }
    
    // Sort select
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            currentPage = 1;
            renderAllIssues();
        });
    }
    
    // Load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderAllIssues(true); // append mode
        });
    }
}

function renderPopularIssues() {
    const listContainer = document.getElementById('popular-issues-list');
    if (!listContainer) return;
    
    // 인기 이슈는 필터링하지 않고 항상 고정된 인기 이슈를 표시
    const popularIssues = allIssues
        .filter(issue => issue.is_popular || issue.isPopular)
        .slice(0, 8); // 최대 8개까지 표시
    
    if (popularIssues.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-8">
                <i data-lucide="star" class="w-8 h-8 mx-auto text-gray-300 mb-3"></i>
                <p class="text-gray-500">인기 이슈가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = popularIssues.map((issue, index) => {
        const yesPrice = issue.yesPercentage || issue.yes_price || 50;
        const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
        
        return `
            <div class="popular-issue-item flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0" 
                 data-issue-id="${issue.id}"
                 onclick="scrollToIssueInAllSection(${issue.id})">
                <div class="flex items-center space-x-4 flex-1">
                    <div class="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                        ${index + 1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center space-x-2 mb-1">
                            <span class="inline-block px-2 py-1 text-xs font-medium rounded" style="${getCategoryBadgeStyle(issue.category)}">
                                ${issue.category}
                            </span>
                            <span class="text-xs text-gray-500 flex items-center">
                                <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
                                ${timeLeft}
                            </span>
                        </div>
                        <h3 class="text-sm font-medium text-gray-900 truncate">${issue.title}</h3>
                    </div>
                </div>
                <div class="flex items-center space-x-4 flex-shrink-0">
                    <div class="text-right">
                        <div class="text-sm font-bold text-green-600">Yes ${yesPrice}%</div>
                        <div class="text-xs text-gray-500">${formatVolume(issue.total_volume || issue.totalVolume || 0)} 감</div>
                    </div>
                    <div class="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-green-500 to-red-500 rounded-full relative">
                            <div class="absolute top-0 w-1 h-full bg-white shadow-sm" style="left: ${yesPrice}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderAllIssues(append = false) {
    const grid = document.getElementById('all-issues-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const noMoreMsg = document.getElementById('no-more-issues');
    const issuesCount = document.getElementById('issues-count');
    
    if (!grid) return;
    
    // Filter and sort issues
    let filteredIssues = allIssues;
    
    // Apply category filter
    if (currentCategory !== '전체') {
        filteredIssues = filteredIssues.filter(issue => issue.category === currentCategory);
    }
    
    // Apply search filter
    if (currentSearch) {
        filteredIssues = filteredIssues.filter(issue => 
            issue.title.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }
    
    // Apply sorting
    filteredIssues = sortIssues(filteredIssues, currentSort);
    
    // Update issues count
    if (issuesCount) {
        issuesCount.textContent = filteredIssues.length;
    }
    
    // Pagination
    const itemsPerPage = 6;
    const startIndex = append ? 0 : 0;
    const endIndex = currentPage * itemsPerPage;
    const issuesToShow = filteredIssues.slice(startIndex, endIndex);
    
    if (issuesToShow.length === 0 && !append) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i data-lucide="search" class="w-12 h-12 mx-auto text-gray-300 mb-4"></i>
                <p class="text-gray-500">검색 결과가 없습니다.</p>
            </div>
        `;
        loadMoreBtn.classList.add('hidden');
        noMoreMsg.classList.add('hidden');
        return;
    }
    
    // Render issues
    if (append) {
        const newIssues = filteredIssues.slice((currentPage - 1) * itemsPerPage, endIndex);
        grid.innerHTML += newIssues.map(issue => createIssueCard(issue)).join('');
    } else {
        grid.innerHTML = issuesToShow.map(issue => createIssueCard(issue)).join('');
    }
    
    // Show/hide load more button
    if (endIndex >= filteredIssues.length) {
        loadMoreBtn.classList.add('hidden');
        if (filteredIssues.length > itemsPerPage) {
            noMoreMsg.classList.remove('hidden');
        }
    } else {
        loadMoreBtn.classList.remove('hidden');
        noMoreMsg.classList.add('hidden');
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function sortIssues(issues, sortType) {
    const sortedIssues = [...issues];
    
    switch (sortType) {
        case 'newest':
            return sortedIssues.sort((a, b) => 
                new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
            );
        case 'popular':
            return sortedIssues.sort((a, b) => 
                (b.total_volume || b.totalVolume || 0) - (a.total_volume || a.totalVolume || 0)
            );
        case 'ending':
            return sortedIssues.sort((a, b) => 
                new Date(a.end_date || a.endDate) - new Date(b.end_date || b.endDate)
            );
        case 'volume':
            return sortedIssues.sort((a, b) => 
                (b.total_volume || b.totalVolume || 0) - (a.total_volume || a.totalVolume || 0)
            );
        default:
            return sortedIssues;
    }
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Get category badge style
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
    
    return categoryColors[category] || 'background: linear-gradient(135deg, #6B7280, #9CA3AF); color: white;';
}

// Scroll to issue in all section
function scrollToIssueInAllSection(issueId) {
    // Scroll to all issues section first
    document.getElementById('all-issues-section').scrollIntoView({ 
        behavior: 'smooth' 
    });
    
    // Wait for scroll to complete, then highlight the issue
    setTimeout(() => {
        const issueCard = document.querySelector(`[data-id="${issueId}"]`);
        if (issueCard) {
            issueCard.scrollIntoView({ 
                behavior: 'smooth',
                block: 'center'
            });
            
            // Add highlight effect
            issueCard.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
            issueCard.style.transform = 'scale(1.02)';
            
            // Remove highlight after 2 seconds
            setTimeout(() => {
                issueCard.style.boxShadow = '';
                issueCard.style.transform = '';
            }, 2000);
        }
    }, 500);
}

// Setup scroll to top functionality
function setupScrollToTop() {
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    if (!scrollToTopBtn) return;
    
    // Show/hide button based on scroll position
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollToTopBtn.classList.remove('opacity-0', 'pointer-events-none');
            scrollToTopBtn.classList.add('opacity-75');
        } else {
            scrollToTopBtn.classList.add('opacity-0', 'pointer-events-none');
            scrollToTopBtn.classList.remove('opacity-75');
        }
    });
    
    // Click handler
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
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


function createIssueCard(issue) {
    const yesPrice = issue.yesPercentage || issue.yes_price || 50;
    const noPrice = 100 - yesPrice;
    const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
    const volume = issue.total_volume || issue.totalVolume || 0;
    
    return `
        <div class="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow" data-id="${issue.id}">
            <div class="flex justify-between items-start mb-4">
                <span class="px-3 py-1 rounded-full text-xs font-medium" style="${getCategoryBadgeStyle(issue.category)}">
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
            
            ${issue.image_url || issue.imageUrl ? 
                `<div class="mb-4">
                    <img src="${issue.image_url || issue.imageUrl}" 
                         alt="${issue.title}" 
                         class="w-full h-48 object-cover rounded-lg border border-gray-200 shadow-sm"
                         loading="lazy"
                         onerror="this.style.display='none'">
                </div>` : ''
            }
            
            ${issue.description ? 
                `<div class="mb-4 p-3 rounded-lg issue-description">
                    <p class="text-sm text-gray-700 leading-relaxed">${issue.description}</p>
                </div>` : ''
            }
            
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
    const resultsTab = document.getElementById('results-tab');
    const commentsTab = document.getElementById('comments-tab');
    const issuesSection = document.getElementById('issues-section');
    const resultsSection = document.getElementById('results-section');
    const commentsSection = document.getElementById('comments-section');
    const createBtn = document.getElementById('create-issue-btn');
    
    if (!issuesTab || !resultsTab || !commentsTab) return;
    
    issuesTab.addEventListener('click', () => {
        switchAdminTab('issues', issuesTab, [resultsTab, commentsTab], [issuesSection], [resultsSection, commentsSection], createBtn, true);
    });
    
    resultsTab.addEventListener('click', () => {
        switchAdminTab('results', resultsTab, [issuesTab, commentsTab], [resultsSection], [issuesSection, commentsSection], createBtn, false);
        loadResultsData();
    });
    
    commentsTab.addEventListener('click', () => {
        switchAdminTab('comments', commentsTab, [issuesTab, resultsTab], [commentsSection], [issuesSection, resultsSection], createBtn, false);
        loadAdminComments();
    });
    
    // 결과 관리 이벤트
    setupResultManagementEvents();
    // 댓글 관리 이벤트
    setupCommentManagementEvents();
}

function switchAdminTab(tabName, activeTabEl, inactiveTabEls, activeSectionEls, inactiveSectionEls, createBtn, showCreateBtn) {
    // 모든 탭을 비활성화
    inactiveTabEls.forEach(tab => {
        tab.className = 'admin-tab pb-4 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium';
    });
    
    // 활성 탭 스타일 적용
    activeTabEl.className = 'admin-tab active pb-4 border-b-2 border-blue-500 text-blue-600 font-medium';
    
    // 모든 섹션 숨김
    inactiveSectionEls.forEach(section => {
        section.classList.add('hidden');
    });
    
    // 활성 섹션 표시
    activeSectionEls.forEach(section => {
        section.classList.remove('hidden');
    });
    
    // 새 이슈 생성 버튼 표시/숨김
    if (createBtn) {
        if (showCreateBtn) {
            createBtn.classList.remove('hidden');
        } else {
            createBtn.classList.add('hidden');
        }
    }
}

// 결과 관리 이벤트 설정
function setupResultManagementEvents() {
    // 결과 필터 변경
    const resultFilter = document.getElementById('result-filter');
    if (resultFilter) {
        resultFilter.addEventListener('change', () => {
            loadResultsData();
        });
    }
    
    // 새로고침 버튼
    const refreshBtn = document.getElementById('refresh-results');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadResultsData();
        });
    }
    
    // 결과 모달 이벤트
    setupResultModal();
    
    // 결과 액션 이벤트 (이벤트 위임)
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.result-decide-btn')) {
            const btn = e.target.closest('.result-decide-btn');
            const issueId = btn.dataset.issueId;
            openResultModal(issueId);
        }
        
        if (e.target.closest('.result-close-btn')) {
            const btn = e.target.closest('.result-close-btn');
            const issueId = btn.dataset.issueId;
            await handleCloseIssue(issueId);
        }
    });
}

async function loadResultsData() {
    const tbody = document.getElementById('results-table-body');
    const filterSelect = document.getElementById('result-filter');
    
    if (!tbody) {
        console.error('results-table-body element not found');
        return;
    }
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8"><i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400"></i><br>로딩 중...</td></tr>';
        
        const filter = filterSelect ? filterSelect.value : 'closed';
        console.log('Loading results with filter:', filter);
        console.log('User token:', userToken ? 'Available' : 'Missing');
        
        const response = await fetch(`/api/admin/issues/closed?filter=${filter}`);
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            if (data.issues.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">해당하는 이슈가 없습니다.</td></tr>';
                return;
            }
            
            console.log('Rendering', data.issues.length, 'issues');
            tbody.innerHTML = data.issues.map(issue => renderResultRow(issue)).join('');
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } else {
            console.error('API returned failure:', data.message);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">데이터 로딩에 실패했습니다: ${data.message || ''}</td></tr>`;
        }
    } catch (error) {
        console.error('결과 데이터 로딩 실패:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">데이터 로딩 중 오류가 발생했습니다: ${error.message}</td></tr>`;
    }
}

function renderResultRow(issue) {
    const endDate = new Date(issue.end_date);
    const formattedEndDate = `${endDate.getFullYear()}.${String(endDate.getMonth() + 1).padStart(2, '0')}.${String(endDate.getDate()).padStart(2, '0')}`;
    
    // 임시로 단순화된 데이터 사용
    const totalVolume = issue.total_volume || 0;
    const yesCount = 0; // 임시로 0 설정
    const noCount = 0; // 임시로 0 설정
    
    let statusBadge = '';
    let resultBadge = '';
    let actionButtons = '';
    
    if (issue.result) {
        const resultColors = {
            'Yes': 'bg-green-100 text-green-800',
            'No': 'bg-red-100 text-red-800',
            'Draw': 'bg-yellow-100 text-yellow-800',
            'Cancelled': 'bg-gray-100 text-gray-800'
        };
        
        statusBadge = '<span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">결과 확정</span>';
        resultBadge = `<span class="px-2 py-1 text-xs font-medium ${resultColors[issue.result]} rounded-full">${issue.result}</span>`;
        
        if (issue.decided_by_name) {
            resultBadge += `<br><small class="text-gray-500">${issue.decided_by_name}</small>`;
        }
    } else {
        const now = new Date();
        const isExpired = endDate < now;
        
        if (isExpired || issue.status === 'closed') {
            statusBadge = '<span class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">마감</span>';
            actionButtons = `
                <button class="result-decide-btn px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" data-issue-id="${issue.id}">
                    결과 결정
                </button>
            `;
        } else {
            statusBadge = '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">진행중</span>';
            actionButtons = `
                <button class="result-close-btn px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors" data-issue-id="${issue.id}">
                    수동 마감
                </button>
            `;
        }
        
        resultBadge = '<span class="text-gray-500">대기 중</span>';
    }
    
    return `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="max-w-xs">
                    <p class="text-sm font-medium text-gray-900 truncate">${issue.title}</p>
                    ${issue.description ? `<p class="text-xs text-gray-500 mt-1 truncate">${issue.description}</p>` : ''}
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${getCategoryBadgeClass(issue.category)}">${issue.category}</span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">${formattedEndDate}</td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">
                    <div>참여 정보</div>
                    <div class="text-xs text-gray-500">${totalVolume.toLocaleString()} 감</div>
                    <div class="text-xs text-gray-500">Yes 확률: ${issue.yes_price}%</div>
                </div>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4">${resultBadge}</td>
            <td class="px-6 py-4">${actionButtons}</td>
        </tr>
    `;
}

function getCategoryBadgeClass(category) {
    const classes = {
        '정치': 'bg-red-100 text-red-800',
        '스포츠': 'bg-cyan-100 text-cyan-800', 
        '경제': 'bg-green-100 text-green-800',
        '코인': 'bg-orange-100 text-orange-800',
        '테크': 'bg-purple-100 text-purple-800',
        '엔터': 'bg-pink-100 text-pink-800',
        '날씨': 'bg-blue-100 text-blue-800',
        '해외': 'bg-indigo-100 text-indigo-800'
    };
    return classes[category] || 'bg-gray-100 text-gray-800';
}

function setupResultModal() {
    const modal = document.getElementById('result-modal');
    const closeBtn = document.getElementById('close-result-modal-btn');
    const cancelBtn = document.getElementById('result-cancel-btn');
    const form = document.getElementById('result-form');
    
    if (!modal || !form) return;
    
    // 모달 닫기
    [closeBtn, cancelBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                modal.classList.add('hidden');
                form.reset();
            });
        }
    });
    
    // 결과 옵션 선택
    modal.addEventListener('click', (e) => {
        if (e.target.closest('.result-option')) {
            const option = e.target.closest('.result-option');
            const radio = option.parentElement.querySelector('input[type="radio"]');
            
            // 모든 옵션 선택 해제
            modal.querySelectorAll('.result-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // 선택된 옵션 표시
            option.classList.add('selected');
            radio.checked = true;
        }
    });
    
    // 폼 제출
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleResultSubmit(e);
    });
}

async function openResultModal(issueId) {
    const modal = document.getElementById('result-modal');
    
    try {
        // 이슈 정보 조회
        const response = await fetch(`/api/issues/${issueId}`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.issue) {
            const issue = data.issue;
            
            // 모달에 이슈 정보 표시
            document.getElementById('result-issue-id').value = issueId;
            document.getElementById('result-issue-title').textContent = issue.title;
            document.getElementById('result-issue-category').textContent = issue.category;
            
            const endDate = new Date(issue.end_date);
            document.getElementById('result-issue-end-date').textContent = 
                `${endDate.getFullYear()}.${String(endDate.getMonth() + 1).padStart(2, '0')}.${String(endDate.getDate()).padStart(2, '0')}`;
            
            modal.classList.remove('hidden');
        } else {
            alert('이슈 정보를 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('이슈 정보 조회 실패:', error);
        alert('이슈 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

async function handleResultSubmit(e) {
    const formData = new FormData(e.target);
    const issueId = formData.get('issueId');
    const result = formData.get('result');
    const reason = formData.get('reason');
    
    if (!result) {
        alert('결과를 선택해주세요.');
        return;
    }
    
    if (!reason.trim()) {
        alert('결정 사유를 입력해주세요.');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/issues/${issueId}/result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ result, reason })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            document.getElementById('result-modal').classList.add('hidden');
            loadResultsData(); // 테이블 새로고침
        } else {
            alert(data.message || '결과 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('결과 처리 실패:', error);
        alert('결과 처리 중 오류가 발생했습니다.');
    }
}

async function handleCloseIssue(issueId) {
    if (!confirm('이슈를 수동으로 마감하시겠습니까?')) return;
    
    try {
        const response = await fetch(`/api/admin/issues/${issueId}/close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            loadResultsData(); // 테이블 새로고침
        } else {
            alert(data.message || '이슈 마감에 실패했습니다.');
        }
    } catch (error) {
        console.error('이슈 마감 실패:', error);
        alert('이슈 마감 중 오류가 발생했습니다.');
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
                <span class="px-2 py-1 text-xs font-semibold rounded-full" style="${getCategoryBadgeStyle(issue.category)}">
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
    const allGrid = document.getElementById('all-issues-grid');
    if (allGrid) {
        allGrid.innerHTML = `
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
    console.log('Issues page - redirecting to home with all issues anchor');
    window.location.href = 'index.html#all-issues';
}

async function initMyPage() {
    console.log('Initializing My Page...');
    
    if (!currentUser) {
        showMyPageLogin();
        return;
    }
    
    await loadMyPageData();
}

function showMyPageLogin() {
    document.getElementById('user-name').textContent = '로그인이 필요합니다';
    document.getElementById('user-email').textContent = '로그인 후 내 정보를 확인하세요';
    document.getElementById('user-coins').textContent = '0 감';
    document.getElementById('user-joined').textContent = '로그인 필요';
    
    document.getElementById('total-bets').textContent = '0';
    document.getElementById('win-rate').textContent = '0%';
    document.getElementById('total-volume').textContent = '0 감';
    
    document.getElementById('user-bets-loading').classList.add('hidden');
    document.getElementById('user-bets-empty').classList.remove('hidden');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function loadMyPageData() {
    try {
        // Update user info
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-coins').textContent = `${currentUser.coins?.toLocaleString() || 0} 감`;
        
        const joinedDate = new Date(currentUser.created_at || currentUser.createdAt || Date.now());
        document.getElementById('user-joined').textContent = `${joinedDate.getFullYear()}.${String(joinedDate.getMonth() + 1).padStart(2, '0')}.${String(joinedDate.getDate()).padStart(2, '0')} 가입`;
        
        // Load user bets
        await loadUserBets();
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
    } catch (error) {
        console.error('Failed to load my page data:', error);
        showError('내 정보를 불러오는데 실패했습니다.');
    }
}

async function loadUserBets() {
    try {
        const response = await fetch('/api/bets/my-bets', {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.bets) {
            const bets = data.bets;
            
            // Update stats
            document.getElementById('total-bets').textContent = bets.length;
            
            const totalVolume = bets.reduce((sum, bet) => sum + bet.amount, 0);
            document.getElementById('total-volume').textContent = `${totalVolume.toLocaleString()} 감`;
            
            // Calculate win rate (placeholder - would need actual results)
            const winRate = bets.length > 0 ? Math.floor(Math.random() * 100) : 0;
            document.getElementById('win-rate').textContent = `${winRate}%`;
            
            // Render bets list
            renderUserBets(bets);
            
        } else {
            // No bets found
            document.getElementById('total-bets').textContent = '0';
            document.getElementById('win-rate').textContent = '0%';
            document.getElementById('total-volume').textContent = '0 감';
            
            document.getElementById('user-bets-loading').classList.add('hidden');
            document.getElementById('user-bets-empty').classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Failed to load user bets:', error);
        
        // Show empty state on error
        document.getElementById('user-bets-loading').classList.add('hidden');
        document.getElementById('user-bets-empty').classList.remove('hidden');
    }
}

function renderUserBets(bets) {
    const container = document.getElementById('user-bets-list');
    const loading = document.getElementById('user-bets-loading');
    const empty = document.getElementById('user-bets-empty');
    
    loading.classList.add('hidden');
    
    if (bets.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    
    container.innerHTML = bets.map(bet => {
        const issueTitle = bet.issue_title || bet.issueTitle || '이슈 제목';
        const betDate = new Date(bet.created_at || bet.createdAt || Date.now());
        const formattedDate = `${betDate.getFullYear()}.${String(betDate.getMonth() + 1).padStart(2, '0')}.${String(betDate.getDate()).padStart(2, '0')}`;
        
        const choiceColor = bet.choice === 'Yes' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
        
        return `
            <div class="p-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h3 class="font-medium text-gray-900 mb-1">${issueTitle}</h3>
                        <div class="flex items-center space-x-4 text-sm text-gray-600">
                            <span class="flex items-center">
                                <i data-lucide="calendar" class="w-4 h-4 mr-1"></i>
                                ${formattedDate}
                            </span>
                            <span class="flex items-center">
                                <i data-lucide="coins" class="w-4 h-4 mr-1 text-yellow-500"></i>
                                ${bet.amount?.toLocaleString() || 0} 감
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <span class="px-3 py-1 rounded-full text-sm font-medium ${choiceColor}">
                            ${bet.choice}
                        </span>
                        <span class="text-sm text-gray-500">
                            결과 대기
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.classList.remove('hidden');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

console.log('✅ Working app script loaded successfully');