import * as auth from '../auth.js';

// 전역 상태
let currentPost = null;
let currentUser = null;
let postId = null;
let commentsPage = 1;

// 페이지 초기화
export async function renderDiscussionPostPage() {
    console.log('renderDiscussionPostPage called');
    
    // URL에서 게시글 ID 추출
    const urlParams = new URLSearchParams(window.location.search);
    postId = urlParams.get('id');
    
    if (!postId) {
        showError();
        return;
    }
    
    // 현재 사용자 정보 가져오기
    if (auth.isLoggedIn()) {
        currentUser = auth.getCurrentUser();
    }
    
    // 게시글 로드
    await loadPost();
    
    // 댓글 로드
    await loadComments();
    
    // 이벤트 리스너 설정
    setupEventListeners();
}

// 게시글 로드
async function loadPost() {
    try {
        showLoading();
        
        const headers = {};
        if (currentUser) {
            headers['Authorization'] = `Bearer ${auth.getToken()}`;
        }
        
        const response = await fetch(`/api/discussions/posts/${postId}`, { headers });
        const data = await response.json();
        
        if (data.success) {
            currentPost = data.data;
            renderPost(currentPost);
            showContent();
        } else {
            showError();
        }
        
    } catch (error) {
        console.error('게시글 로드 오류:', error);
        showError();
    }
}

// 게시글 렌더링
function renderPost(post) {
    // 브레드크럼 업데이트
    const breadcrumbCategory = document.getElementById('breadcrumb-category');
    if (breadcrumbCategory) {
        breadcrumbCategory.textContent = post.category_name || '미분류';
    }
    
    // 공지/고정 배지 (null 체크 추가)
    const noticeBadge = document.getElementById('post-notice-badge');
    const pinnedBadge = document.getElementById('post-pinned-badge');
    
    if (post.is_notice && noticeBadge) {
        noticeBadge.classList.remove('hidden');
    }
    if (post.is_pinned && pinnedBadge) {
        pinnedBadge.classList.remove('hidden');
    }
    
    // 카테고리 배지 (null 체크 강화)
    const categoryElement = document.getElementById('post-category');
    if (categoryElement && post.category_name) {
        categoryElement.textContent = `${post.category_icon || ''} ${post.category_name}`;
        if (post.category_color) {
            categoryElement.style.backgroundColor = `${post.category_color}20`;
            categoryElement.style.color = post.category_color;
        }
    }
    
    // 제목
    const titleElement = document.getElementById('post-title');
    if (titleElement) {
        titleElement.textContent = post.title;
    }
    
    // 작성자 정보 (티어 아이콘 포함)
    const authorElement = document.getElementById('post-author');
    if (authorElement) {
        const tierIcon = post.tier_icon || '⚪';
        const authorName = post.author_name || '익명';
        authorElement.textContent = `${tierIcon} ${authorName}`;
    }
    
    // 작성일
    const dateElement = document.getElementById('post-date');
    if (dateElement) {
        const date = new Date(post.created_at);
        dateElement.textContent = date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Seoul'
        });
    }
    
    // 통계
    const viewsElement = document.getElementById('post-views');
    const commentsElement = document.getElementById('post-comments');
    const likesElement = document.getElementById('post-likes');
    
    if (viewsElement) viewsElement.textContent = post.view_count || 0;
    if (commentsElement) commentsElement.textContent = post.comment_count || 0;
    if (likesElement) likesElement.textContent = post.like_count || 0;
    
    // 좋아요 버튼 상태 (null 체크 강화)
    const likeBtn = document.getElementById('like-btn');
    if (likeBtn) {
        const heartIcon = likeBtn.querySelector('i');
        if (heartIcon) {
            if (post.user_liked) {
                heartIcon.classList.add('text-red-500');
                likeBtn.classList.add('text-red-500');
            } else {
                heartIcon.classList.remove('text-red-500');
                likeBtn.classList.remove('text-red-500');
            }
        }
    }
    
    // 게시글 내용
    const bodyElement = document.getElementById('post-body');
    if (bodyElement) {
        // 간단한 HTML 이스케이프 해제 및 줄바꿈 처리
        let content = post.content
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\n/g, '<br>');
        
        // 미디어 표시 추가
        if (post.media_urls && post.media_urls.length > 0) {
            const mediaHtml = createDetailMediaDisplay(post.media_urls, post.media_types);
            content += mediaHtml;
        }
        
        bodyElement.innerHTML = content;
    }
    
    // 작성자 또는 관리자 액션 버튼 표시
    if (currentUser) {
        const isAuthor = currentUser.id === post.author_id;
        // 관리자인지 확인 (비동기)
        auth.isAdmin().then(isAdminUser => {
            if (isAuthor || isAdminUser) {
                const actionsElement = document.getElementById('post-actions');
                if (actionsElement) {
                    actionsElement.classList.remove('hidden');
                }
            }
        }).catch(error => {
            console.error('관리자 확인 오류:', error);
            // 오류 시 작성자만 표시
            if (isAuthor) {
                const actionsElement = document.getElementById('post-actions');
                if (actionsElement) {
                    actionsElement.classList.remove('hidden');
                }
            }
        });
    }
    
    // 댓글 수 업데이트
    const commentsCountElement = document.getElementById('comments-count');
    if (commentsCountElement) {
        commentsCountElement.textContent = post.comment_count || 0;
    }
    
    // 페이지 제목 업데이트
    document.title = `${post.title} | 주제별 분석방 | 예겜`;
}

// 댓글 로드
async function loadComments() {
    try {
        showCommentsLoading();
        
        const response = await fetch(`/api/discussions/posts/${postId}/comments?page=${commentsPage}&limit=20`);
        const data = await response.json();
        
        if (data.success) {
            renderComments(data.data.comments);
            renderCommentsPagination(data.data.pagination);
            
            if (data.data.comments.length > 0) {
                showCommentsList();
            } else {
                showCommentsEmpty();
            }
        } else {
            showCommentsEmpty();
        }
        
    } catch (error) {
        console.error('댓글 로드 오류:', error);
        showCommentsEmpty();
    }
}

// 댓글 렌더링
function renderComments(comments) {
    const commentsList = document.getElementById('comments-list');
    if (!commentsList) return;
    
    commentsList.innerHTML = comments.map(comment => {
        const isAuthor = currentUser && currentUser.id === comment.author_id;
        
        return `
            <div class="comment border border-gray-200 rounded-lg p-4" data-comment-id="${comment.id}">
                <div class="flex items-start space-x-3">
                    <div class="flex-1">
                        <!-- Comment Header -->
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center space-x-3">
                                <span class="font-medium text-gray-900">${(comment.tier_icon || '⚪')} ${comment.author_name || '익명'}</span>
                                <span class="text-sm text-gray-500">
                                    ${new Date(comment.created_at).toLocaleDateString('ko-KR', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'Asia/Seoul'
                                    })}
                                </span>
                                ${comment.updated_at !== comment.created_at ? 
                                    '<span class="text-xs text-gray-400">(수정됨)</span>' : ''
                                }
                            </div>
                            
                            <div class="flex items-center space-x-2">
                                <button class="comment-like-btn flex items-center space-x-1 text-sm text-gray-500 hover:text-red-500 transition-colors" 
                                        data-comment-id="${comment.id}">
                                    <i data-lucide="heart" class="w-4 h-4"></i>
                                    <span>${comment.like_count || 0}</span>
                                </button>
                                
                                ${currentUser ? `
                                    <button class="reply-btn text-sm text-gray-500 hover:text-blue-500 transition-colors"
                                            data-comment-id="${comment.id}">
                                        답글
                                    </button>
                                ` : ''}
                                
                                ${isAuthor ? `
                                    <button class="edit-comment-btn text-sm text-gray-500 hover:text-gray-700 transition-colors"
                                            data-comment-id="${comment.id}">
                                        수정
                                    </button>
                                    <button class="delete-comment-btn text-sm text-red-500 hover:text-red-700 transition-colors"
                                            data-comment-id="${comment.id}">
                                        삭제
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        
                        <!-- Comment Content -->
                        <div class="comment-content text-gray-700 leading-relaxed">
                            ${comment.content.replace(/\n/g, '<br>')}
                        </div>
                        
                        <!-- Reply Form (hidden by default) -->
                        <div class="reply-form hidden mt-4 pl-4 border-l-2 border-gray-200" data-comment-id="${comment.id}">
                            <textarea class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" 
                                      rows="3" placeholder="답글을 작성해주세요..."></textarea>
                            <div class="flex justify-end space-x-2 mt-2">
                                <button class="cancel-reply-btn text-sm text-gray-600 hover:text-gray-800 transition-colors">
                                    취소
                                </button>
                                <button class="submit-reply-btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors">
                                    답글 작성
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Lucide 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    // 댓글 이벤트 리스너 설정
    setupCommentEventListeners();
}

// 댓글 페이지네이션 렌더링
function renderCommentsPagination(pagination) {
    const container = document.getElementById('comments-pagination');
    if (!container || pagination.pages <= 1) {
        container?.classList.add('hidden');
        return;
    }
    
    const currentPage = pagination.page;
    const totalPages = pagination.pages;
    
    let paginationHTML = '<div class="flex items-center justify-center space-x-2">';
    
    // 이전 페이지
    if (currentPage > 1) {
        paginationHTML += `
            <button onclick="changeCommentsPage(${currentPage - 1})" 
                    class="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                이전
            </button>
        `;
    }
    
    // 페이지 번호들
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentPage;
        paginationHTML += `
            <button onclick="changeCommentsPage(${i})" 
                    class="px-3 py-2 text-sm border rounded-md transition-colors
                           ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}">
                ${i}
            </button>
        `;
    }
    
    // 다음 페이지
    if (currentPage < totalPages) {
        paginationHTML += `
            <button onclick="changeCommentsPage(${currentPage + 1})" 
                    class="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                다음
            </button>
        `;
    }
    
    paginationHTML += '</div>';
    container.innerHTML = paginationHTML;
    container.classList.remove('hidden');
}

// 댓글 페이지 변경
window.changeCommentsPage = function(page) {
    commentsPage = page;
    loadComments();
};

// 댓글 이벤트 리스너 설정
function setupCommentEventListeners() {
    // 댓글 좋아요
    document.querySelectorAll('.comment-like-btn').forEach(btn => {
        btn.addEventListener('click', handleCommentLike);
    });
    
    // 답글 버튼
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', toggleReplyForm);
    });
    
    // 답글 취소
    document.querySelectorAll('.cancel-reply-btn').forEach(btn => {
        btn.addEventListener('click', cancelReply);
    });
    
    // 답글 제출
    document.querySelectorAll('.submit-reply-btn').forEach(btn => {
        btn.addEventListener('click', submitReply);
    });
}

// 댓글 좋아요 처리
async function handleCommentLike(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const commentId = e.currentTarget.dataset.commentId;
    
    try {
        const response = await fetch(`/api/discussions/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 좋아요 수 업데이트
            const likeCount = e.currentTarget.querySelector('span');
            const currentCount = parseInt(likeCount.textContent) || 0;
            likeCount.textContent = data.liked ? currentCount + 1 : currentCount - 1;
            
            // 아이콘 색상 변경
            const heartIcon = e.currentTarget.querySelector('i');
            if (data.liked) {
                heartIcon.classList.add('text-red-500');
            } else {
                heartIcon.classList.remove('text-red-500');
            }
        }
        
    } catch (error) {
        console.error('댓글 좋아요 오류:', error);
    }
}

// 답글 폼 토글
function toggleReplyForm(e) {
    const commentId = e.target.dataset.commentId;
    const replyForm = document.querySelector(`.reply-form[data-comment-id="${commentId}"]`);
    
    if (replyForm) {
        replyForm.classList.toggle('hidden');
        
        if (!replyForm.classList.contains('hidden')) {
            const textarea = replyForm.querySelector('textarea');
            textarea?.focus();
        }
    }
}

// 답글 취소
function cancelReply(e) {
    const replyForm = e.target.closest('.reply-form');
    if (replyForm) {
        replyForm.classList.add('hidden');
        replyForm.querySelector('textarea').value = '';
    }
}

// 답글 제출
async function submitReply(e) {
    const replyForm = e.target.closest('.reply-form');
    const textarea = replyForm.querySelector('textarea');
    const content = textarea.value.trim();
    const parentId = replyForm.dataset.commentId;
    
    if (!content) {
        alert('답글 내용을 입력해주세요.');
        return;
    }
    
    let responseData = null;
    
    try {
        e.target.disabled = true;
        e.target.textContent = '작성 중...';
        
        const response = await fetch(`/api/discussions/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                parent_id: parentId
            })
        });
        
        responseData = await response.json();
        
        if (responseData.success) {
            // 폼 숨기기 및 초기화
            replyForm.classList.add('hidden');
            textarea.value = '';
            
            // 댓글 목록 새로고침
            await loadComments();
            
            // 게시글 댓글 수 업데이트
            if (currentPost) {
                currentPost.comment_count = (currentPost.comment_count || 0) + 1;
                document.getElementById('post-comments').textContent = currentPost.comment_count;
                document.getElementById('comments-count').textContent = currentPost.comment_count;
            }
        } else {
            const errorMessage = responseData.error || responseData.message || '답글 작성 중 오류가 발생했습니다.';
            alert(errorMessage);
            
            // 쿨다운 에러인 경우 타이머 시작
            if (errorMessage.includes('30초에 한 번만 가능')) {
                // 서버 응답에서 cooldownRemaining 직접 추출
                if (responseData.cooldownRemaining) {
                    startCooldownTimer(e.target, responseData.cooldownRemaining, '답글 작성');
                    return; // finally 블록 실행 안 함
                }
                // 다음으로 메시지에서 시간 추출 시도
                const match = errorMessage.match(/(\d+)초 후에/);
                if (match) {
                    const remainingTime = parseInt(match[1]);
                    startCooldownTimer(e.target, remainingTime, '답글 작성');
                    return; // finally 블록 실행 안 함
                }
            }
        }
        
    } catch (error) {
        console.error('답글 작성 오류:', error);
        alert('답글 작성 중 오류가 발생했습니다.');
    } finally {
        e.target.disabled = false;
        e.target.textContent = '답글 작성';
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 좋아요 버튼
    const likeBtn = document.getElementById('like-btn');
    likeBtn?.addEventListener('click', handlePostLike);
    
    // 댓글 작성 폼
    const commentForm = document.getElementById('comment-form');
    commentForm?.addEventListener('submit', handleCommentSubmit);
    
    // 게시글 수정/삭제 버튼
    const editBtn = document.getElementById('edit-post-btn');
    const deleteBtn = document.getElementById('delete-post-btn');
    editBtn?.addEventListener('click', handlePostEdit);
    deleteBtn?.addEventListener('click', handlePostDelete);
    
    // 로그인 상태에 따라 댓글 폼 표시/숨기기
    const commentFormSection = document.getElementById('comment-form-section');
    if (!currentUser) {
        if (commentFormSection) {
            commentFormSection.innerHTML = `
                <div class="text-center py-4 bg-gray-50 rounded-lg">
                    <p class="text-gray-600 mb-3">댓글을 작성하려면 로그인이 필요합니다.</p>
                    <a href="login.html" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        로그인하기
                    </a>
                </div>
            `;
        }
    }
}

// 게시글 좋아요 처리
async function handlePostLike(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    try {
        const response = await fetch(`/api/discussions/posts/${postId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 좋아요 수 업데이트
            const likesElement = document.getElementById('post-likes');
            const currentCount = parseInt(likesElement.textContent) || 0;
            likesElement.textContent = data.liked ? currentCount + 1 : currentCount - 1;
            
            // 버튼 상태 변경
            const heartIcon = e.currentTarget.querySelector('i');
            if (data.liked) {
                heartIcon.classList.add('text-red-500');
                e.currentTarget.classList.add('text-red-500');
            } else {
                heartIcon.classList.remove('text-red-500');
                e.currentTarget.classList.remove('text-red-500');
            }
        }
        
    } catch (error) {
        console.error('좋아요 처리 오류:', error);
    }
}

// 댓글 작성 처리
async function handleCommentSubmit(e) {
    e.preventDefault();
    
    const contentTextarea = document.getElementById('comment-content');
    const content = contentTextarea.value.trim();
    
    if (!content) {
        alert('댓글 내용을 입력해주세요.');
        return;
    }
    
    let responseData = null;
    
    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '작성 중...';
        
        const response = await fetch(`/api/discussions/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        responseData = await response.json();
        
        if (responseData.success) {
            // 폼 초기화
            contentTextarea.value = '';
            
            // 댓글 목록 새로고침
            await loadComments();
            
            // 게시글 댓글 수 업데이트
            if (currentPost) {
                currentPost.comment_count = (currentPost.comment_count || 0) + 1;
                document.getElementById('post-comments').textContent = currentPost.comment_count;
                document.getElementById('comments-count').textContent = currentPost.comment_count;
            }
        } else {
            const errorMessage = responseData.error || responseData.message || '댓글 작성 중 오류가 발생했습니다.';
            alert(errorMessage);
            
            // 쿨다운 에러인 경우 타이머 시작
            if (errorMessage.includes('30초에 한 번만 가능')) {
                // 서버 응답에서 cooldownRemaining 직접 추출
                if (responseData.cooldownRemaining) {
                    const submitBtn = e.target.querySelector('button[type="submit"]');
                    startCooldownTimer(submitBtn, responseData.cooldownRemaining, '댓글 작성');
                    return; // finally 블록 실행 안 함
                }
                // 다음으로 메시지에서 시간 추출 시도
                const match = errorMessage.match(/(\d+)초 후에/);
                if (match) {
                    const remainingTime = parseInt(match[1]);
                    const submitBtn = e.target.querySelector('button[type="submit"]');
                    startCooldownTimer(submitBtn, remainingTime, '댓글 작성');
                    return; // finally 블록 실행 안 함
                }
            }
        }
        
    } catch (error) {
        console.error('댓글 작성 오류:', error);
        alert('댓글 작성 중 오류가 발생했습니다.');
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = '댓글 작성';
    }
}

// 쿨다운 타이머 함수
function startCooldownTimer(button, seconds, originalText) {
    button.disabled = true;
    
    const timer = setInterval(() => {
        if (seconds > 0) {
            button.textContent = `${seconds}초 후 다시 시도`;
            seconds--;
        } else {
            clearInterval(timer);
            button.disabled = false;
            button.textContent = originalText;
        }
    }, 1000);
}

// 상태 표시 함수들
function showLoading() {
    document.getElementById('post-loading').classList.remove('hidden');
    document.getElementById('post-content').classList.add('hidden');
    document.getElementById('post-error').classList.add('hidden');
}

function showContent() {
    document.getElementById('post-loading').classList.add('hidden');
    document.getElementById('post-content').classList.remove('hidden');
    document.getElementById('post-error').classList.add('hidden');
}

function showError() {
    document.getElementById('post-loading').classList.add('hidden');
    document.getElementById('post-content').classList.add('hidden');
    document.getElementById('post-error').classList.remove('hidden');
}

function showCommentsLoading() {
    document.getElementById('comments-loading').classList.remove('hidden');
    document.getElementById('comments-list').classList.add('hidden');
    document.getElementById('comments-empty').classList.add('hidden');
}

function showCommentsList() {
    document.getElementById('comments-loading').classList.add('hidden');
    document.getElementById('comments-list').classList.remove('hidden');
    document.getElementById('comments-empty').classList.add('hidden');
}

function showCommentsEmpty() {
    document.getElementById('comments-loading').classList.add('hidden');
    document.getElementById('comments-list').classList.add('hidden');
    document.getElementById('comments-empty').classList.remove('hidden');
}

// 게시글 상세용 미디어 표시 생성
function createDetailMediaDisplay(mediaUrls, mediaTypes) {
    if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
        return '';
    }
    
    let mediaHtml = '<div class="mt-6 space-y-4">';
    
    mediaUrls.forEach((url, index) => {
        const mediaType = mediaTypes?.[index] || 'unknown';
        const mediaInfo = detectMediaType(url);
        
        switch (mediaInfo.type) {
            case 'youtube':
                mediaHtml += `
                    <div class="media-item">
                        <div class="relative bg-black rounded-lg overflow-hidden">
                            <iframe 
                                src="${mediaInfo.embedUrl}" 
                                class="w-full h-64 md:h-80"
                                frameborder="0" 
                                allowfullscreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                            </iframe>
                        </div>
                        <p class="text-sm text-gray-500 mt-2">YouTube 동영상</p>
                    </div>
                `;
                break;
            case 'image':
                mediaHtml += `
                    <div class="media-item">
                        <div class="rounded-lg overflow-hidden">
                            <img src="${url}" alt="첨부 이미지" 
                                 class="w-full h-auto max-h-96 object-contain bg-gray-50 cursor-pointer"
                                 onclick="openImageModal('${url}')"
                                 onerror="this.style.display='none'">
                        </div>
                        <p class="text-sm text-gray-500 mt-2">첨부 이미지</p>
                    </div>
                `;
                break;
            case 'video':
                mediaHtml += `
                    <div class="media-item">
                        <div class="rounded-lg overflow-hidden bg-black">
                            <video controls class="w-full h-auto max-h-96">
                                <source src="${url}" type="video/mp4">
                                브라우저가 동영상을 지원하지 않습니다.
                            </video>
                        </div>
                        <p class="text-sm text-gray-500 mt-2">첨부 동영상</p>
                    </div>
                `;
                break;
            default:
                mediaHtml += `
                    <div class="media-item">
                        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div class="flex items-center space-x-3">
                                <i data-lucide="link" class="w-6 h-6 text-gray-400"></i>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-gray-900">첨부 링크</p>
                                    <a href="${url}" target="_blank" rel="noopener noreferrer" 
                                       class="text-sm text-blue-600 hover:text-blue-800 truncate block">
                                        ${url}
                                    </a>
                                </div>
                                <a href="${url}" target="_blank" rel="noopener noreferrer"
                                   class="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors">
                                    열기
                                </a>
                            </div>
                        </div>
                    </div>
                `;
        }
    });
    
    mediaHtml += '</div>';
    return mediaHtml;
}

// 이미지 모달 열기 (간단한 이미지 확대 보기)
function openImageModal(imageUrl) {
    // 간단한 이미지 모달 생성
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4';
    modal.onclick = () => modal.remove();
    
    modal.innerHTML = `
        <div class="relative max-w-full max-h-full">
            <img src="${imageUrl}" alt="확대 이미지" class="max-w-full max-h-full object-contain">
            <button class="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-colors"
                    onclick="event.stopPropagation(); this.closest('.fixed').remove()">
                <i data-lucide="x" class="w-6 h-6"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// 미디어 타입 감지 (discussions.js와 동일한 함수)
function detectMediaType(url) {
    if (!url) return { type: 'unknown', url };
    
    // YouTube URL 패턴
    const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of youtubePatterns) {
        const match = url.match(pattern);
        if (match) {
            return {
                type: 'youtube',
                url,
                videoId: match[1],
                embedUrl: `https://www.youtube.com/embed/${match[1]}`,
                thumbnailUrl: `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`
            };
        }
    }
    
    // 이미지 URL 패턴
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
    if (imageExtensions.test(url)) {
        return { type: 'image', url };
    }
    
    // 비디오 URL 패턴
    const videoExtensions = /\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i;
    if (videoExtensions.test(url)) {
        return { type: 'video', url };
    }
    
    return { type: 'unknown', url };
}

// 게시글 수정 처리
async function handlePostEdit(e) {
    e.preventDefault();
    
    if (!currentUser || !currentPost) {
        alert('수정 권한이 없습니다.');
        return;
    }
    
    // 작성자이거나 관리자인지 확인
    const isAuthor = currentUser.id === currentPost.author_id;
    const isAdminUser = await auth.isAdmin().catch(() => false);
    
    if (!isAuthor && !isAdminUser) {
        alert('수정 권한이 없습니다.');
        return;
    }
    
    // 간단한 수정 폼 모달 생성
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold">게시글 수정</h2>
                    <button class="close-modal text-gray-400 hover:text-gray-600">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>
                
                <form class="edit-post-form space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">제목</label>
                        <input type="text" name="title" value="${currentPost.title}" required
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">내용</label>
                        <textarea name="content" rows="8" required
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">${currentPost.content}</textarea>
                    </div>
                    <div class="flex justify-end space-x-3">
                        <button type="button" class="cancel-edit px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                            취소
                        </button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                            수정
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 모달 이벤트 설정
    const closeModal = () => modal.remove();
    modal.querySelector('.close-modal').addEventListener('click', closeModal);
    modal.querySelector('.cancel-edit').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // 폼 제출 처리
    modal.querySelector('.edit-post-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const updateData = {
            title: formData.get('title'),
            content: formData.get('content')
        };
        
        try {
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = '수정 중...';
            
            const response = await fetch(`/api/discussions/posts/${postId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${auth.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert('게시글이 수정되었습니다.');
                closeModal();
                // 페이지 새로고침
                window.location.reload();
            } else {
                alert(data.message || '수정 중 오류가 발생했습니다.');
            }
            
        } catch (error) {
            console.error('게시글 수정 오류:', error);
            alert('수정 중 오류가 발생했습니다.');
        }
    });
    
    // 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// 게시글 삭제 처리
async function handlePostDelete(e) {
    e.preventDefault();
    
    if (!currentUser || !currentPost) {
        alert('삭제 권한이 없습니다.');
        return;
    }
    
    // 작성자이거나 관리자인지 확인
    const isAuthor = currentUser.id === currentPost.author_id;
    const isAdminUser = await auth.isAdmin().catch(() => false);
    
    if (!isAuthor && !isAdminUser) {
        alert('삭제 권한이 없습니다.');
        return;
    }
    
    if (!confirm('정말로 이 게시글을 삭제하시겠습니까? 삭제된 게시글은 복구할 수 없습니다.')) {
        return;
    }
    
    try {
        e.target.disabled = true;
        e.target.textContent = '삭제 중...';
        
        const response = await fetch(`/api/discussions/posts/${postId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('게시글이 삭제되었습니다.');
            // 목록 페이지로 이동
            window.location.href = 'discussions.html';
        } else {
            alert(data.message || '삭제 중 오류가 발생했습니다.');
            e.target.disabled = false;
            e.target.textContent = '삭제';
        }
        
    } catch (error) {
        console.error('게시글 삭제 오류:', error);
        alert('삭제 중 오류가 발생했습니다.');
        e.target.disabled = false;
        e.target.textContent = '삭제';
    }
}

// 페이지 로드시 초기화
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('discussion-post.html')) {
        renderDiscussionPostPage();
    }
});