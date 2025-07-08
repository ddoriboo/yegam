import * as auth from '../auth.js';
import { getUserTier, createTierDisplay, addTierStyles } from '../utils/tier-utils.js';

let currentUserId = null;
let userLikedComments = new Set();

// 댓글 시스템 초기화
export function initComments() {
    // 티어 스타일 추가
    addTierStyles();
    
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
    
    // 현재 사용자 ID 설정
    if (auth.isLoggedIn()) {
        currentUserId = auth.getCurrentUser().id;
    }
}

// 댓글 섹션 토글
async function toggleComments(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const toggleBtn = document.querySelector(`.comments-toggle-btn[data-issue-id="${issueId}"]`);
    const chevron = toggleBtn.querySelector('[data-lucide="chevron-down"]');
    
    if (commentsSection.classList.contains('hidden')) {
        // 댓글 섹션 열기
        commentsSection.classList.remove('hidden');
        chevron.classList.add('rotate-180');
        
        // 댓글 로드
        await loadComments(issueId);
        
        // 댓글 작성 폼 표시 (로그인한 사용자만)
        if (auth.isLoggedIn()) {
            showCommentForm(issueId);
        }
    } else {
        // 댓글 섹션 닫기
        commentsSection.classList.add('hidden');
        chevron.classList.remove('rotate-180');
    }
}

// 댓글 로드
async function loadComments(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const loadingEl = commentsSection.querySelector('.comments-loading');
    const containerEl = commentsSection.querySelector('.comments-container');
    
    try {
        loadingEl.classList.remove('hidden');
        containerEl.classList.add('hidden');
        
        
        // 댓글 데이터 가져오기
        const response = await fetch(`/api/comments/issue/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            // 사용자의 좋아요 상태 가져오기
            if (currentUserId) {
                await loadUserLikeStatus(issueId);
            }
            
            // 댓글 렌더링
            containerEl.innerHTML = renderComments(data.comments);
            
            // Lucide 아이콘 다시 로드
            if (window.lucide) {
                window.lucide.createIcons();
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

// 사용자 좋아요 상태 로드
async function loadUserLikeStatus(issueId) {
    if (!currentUserId) return;
    
    try {
        const response = await fetch(`/api/comments/likes/${currentUserId}/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            userLikedComments = new Set(data.likedComments);
        }
    } catch (error) {
        console.error('좋아요 상태 로드 실패:', error);
    }
}

// 댓글 렌더링
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

// 단일 댓글 렌더링
function renderComment(comment) {
    const isLiked = userLikedComments.has(comment.id);
    const isOwner = currentUserId === comment.user_id;
    const isHighlighted = comment.is_highlighted;
    
    // 사용자 티어 계산 (헤더와 동일한 로직 사용) - 더 높은 값 사용
    const userCoins = Math.max(comment.gam_balance || 0, comment.coins || 0);
    const userTier = getUserTier(userCoins);
    const tierBadge = createTierDisplay(userTier, true);
    
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
                        ${tierBadge}
                        ${highlightBadge}
                        <span class="text-xs text-gray-500">${comment.timeAgo}</span>
                    </div>
                    <p class="text-gray-800 text-sm leading-relaxed">${comment.content}</p>
                </div>
            </div>
            
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    ${currentUserId ? `
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
                    <div class="flex items-center space-x-2">
                        ${!isHighlighted ? `
                            <button class="comment-highlight-btn text-xs text-yellow-600 hover:text-yellow-700 transition-colors" data-comment-id="${comment.id}">
                                <i data-lucide="star" class="w-3 h-3 mr-1"></i>
                                강조하기
                            </button>
                        ` : ''}
                        <button class="comment-delete-btn text-xs text-red-500 hover:text-red-700 transition-colors" data-comment-id="${comment.id}">
                            <i data-lucide="trash-2" class="w-3 h-3 mr-1"></i>
                            삭제
                        </button>
                    </div>
                ` : ''}
            </div>
            
            <!-- 답글 폼 영역 -->
            <div class="reply-form-container hidden mt-4"></div>
            
            <!-- 답글 목록 -->
            ${repliesHtml ? `
                <div class="replies-container mt-4 pl-8 border-l-2 border-gray-100">
                    ${repliesHtml}
                </div>
            ` : ''}
        </div>
    `;
}

// 답글 렌더링
function renderReply(reply) {
    const isLiked = userLikedComments.has(reply.id);
    const isOwner = currentUserId === reply.user_id;
    
    // 사용자 티어 계산 (헤더와 동일한 로직 사용) - 더 높은 값 사용
    const userCoins = Math.max(reply.gam_balance || 0, reply.coins || 0);
    const userTier = getUserTier(userCoins);
    const tierBadge = createTierDisplay(userTier, true);
    
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
                        ${tierBadge}
                        <span class="text-xs text-gray-500">${reply.timeAgo}</span>
                    </div>
                    <p class="text-gray-800 text-sm leading-relaxed">${reply.content}</p>
                    
                    <div class="flex items-center justify-between mt-2">
                        <div class="flex items-center space-x-3">
                            ${currentUserId ? `
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

// 댓글 작성 폼 표시
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
    
    // 글자 수 카운터
    const textarea = formContainer.querySelector('textarea');
    const charCount = formContainer.querySelector('.character-count');
    
    textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length;
    });
    
    // 취소 버튼
    formContainer.querySelector('.cancel-comment').addEventListener('click', () => {
        formContainer.classList.add('hidden');
    });
    
    textarea.focus();
}

// 답글 폼 토글
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
        
        // 글자 수 카운터
        const textarea = replyContainer.querySelector('textarea');
        const charCount = replyContainer.querySelector('.character-count');
        
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
        
        // 취소 버튼
        replyContainer.querySelector('.cancel-reply').addEventListener('click', () => {
            replyContainer.classList.add('hidden');
        });
        
        textarea.focus();
    } else {
        replyContainer.classList.add('hidden');
    }
}

// 댓글 제출 처리
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
                userId: currentUserId,
                issueId: parseInt(issueId),
                content: content,
                parentId: parentId ? parseInt(parentId) : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 댓글 목록 새로고침
            await loadComments(issueId);
            
            // 이슈 목록 새로고침 (댓글 수 업데이트)
            if (window.refreshIssueList) {
                await window.refreshIssueList();
            }
            
            // 폼 리셋
            form.reset();
            
            // 답글 폼인 경우 숨기기
            if (parentId) {
                form.closest('.reply-form-container').classList.add('hidden');
            }
            
            // 성공 메시지
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

// 댓글 좋아요 처리
async function handleCommentLike(commentId, btn) {
    if (!currentUserId) {
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
                userId: currentUserId,
                action: action
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // UI 업데이트
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

// 댓글 삭제 처리
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
                userId: currentUserId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 댓글 요소 찾기
            const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
            const issueId = commentEl.closest('.comments-section').dataset.issueId;
            
            // 댓글 목록 새로고침
            await loadComments(issueId);
            
            // 이슈 목록 새로고침 (댓글 수 업데이트)
            if (window.refreshIssueList) {
                await window.refreshIssueList();
            }
            
            showNotification('댓글이 삭제되었습니다.', 'success');
        } else {
            throw new Error(data.error || '댓글 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 삭제 실패:', error);
        showNotification(error.message, 'error');
    }
}

// 알림 표시
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all duration-300 transform translate-x-full opacity-0 ${
        type === 'success' ? 'bg-green-500' : 
        type === 'error' ? 'bg-red-500' : 
        'bg-blue-500'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 애니메이션
    requestAnimationFrame(() => {
        notification.classList.remove('translate-x-full', 'opacity-0');
    });
    
    // 3초 후 제거
    setTimeout(() => {
        notification.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}