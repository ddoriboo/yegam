// Simple non-module version of app.js for immediate deployment
console.log('App starting...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Show loading message
    showLoadingMessage();
    
    // Initialize the application
    initializeApp();
});

function showLoadingMessage() {
    const grid = document.getElementById('popular-issues-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-blue-600 rounded-full" role="status">
                    <span class="sr-only">Loading...</span>
                </div>
                <p class="mt-4 text-gray-600">예측 이슈를 불러오는 중...</p>
            </div>
        `;
    }
}

function initializeApp() {
    console.log('Initializing app...');
    
    // Update header with login button
    updateHeader();
    
    // Load sample issues
    loadSampleIssues();
    
    // Setup category filters
    setupCategoryFilters();
}

function updateHeader() {
    const userActionsContainer = document.getElementById('header-user-actions');
    if (!userActionsContainer) return;
    
    userActionsContainer.innerHTML = `
        <a href="login.html" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
            로그인/회원가입
        </a>
    `;
}

function setupCategoryFilters() {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    
    const categories = ['전체', '정치', '스포츠', '경제', '코인', '테크', '엔터', '날씨', '해외'];
    
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
        loadSampleIssues(category);
    });
}

function loadSampleIssues(category = '전체') {
    const sampleIssues = [
        {
            id: 1,
            title: "윤석열 대통령, 2025년 내 탄핵소추안 통과될까?",
            category: "정치",
            yesPrice: 35,
            totalVolume: 85000000,
            endDate: "2025-12-31",
            isPopular: true
        },
        {
            id: 2,
            title: "손흥민, 2025년 발롱도르 후보 30인에 선정될까?",
            category: "스포츠", 
            yesPrice: 28,
            totalVolume: 45000000,
            endDate: "2025-10-15",
            isPopular: true
        },
        {
            id: 3,
            title: "비트코인, 2025년 내 20만 달러 돌파할까?",
            category: "코인",
            yesPrice: 45,
            totalVolume: 250000000,
            endDate: "2025-12-31",
            isPopular: true
        }
    ];
    
    let filteredIssues = sampleIssues;
    if (category !== '전체') {
        filteredIssues = sampleIssues.filter(issue => issue.category === category);
    }
    
    const grid = document.getElementById('popular-issues-grid');
    if (!grid) return;
    
    if (filteredIssues.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-gray-500">해당 카테고리에 이슈가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredIssues.map(issue => createIssueCard(issue)).join('');
    
    // Reinitialize icons after DOM update
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function createIssueCard(issue) {
    const noPrice = 100 - issue.yesPrice;
    const timeLeft = getTimeLeft(issue.endDate);
    
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
                    <span class="text-lg font-bold text-green-600">${issue.yesPrice}%</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-lg font-bold text-red-500">${noPrice}%</span>
                    <span class="text-sm font-medium text-red-500">No</span>
                </div>
            </div>
            
            <div class="relative mb-6">
                <div class="w-full bg-gradient-to-r from-green-500 to-red-500 rounded-full h-2 mb-2">
                    <div class="absolute top-[-2px] bg-white border-2 border-blue-500 rounded-full w-3 h-3" 
                         style="left: calc(${issue.yesPrice}% - 6px)"></div>
                </div>
            </div>
            
            <div class="flex space-x-3 mb-4">
                <button class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                        onclick="showLoginAlert()">
                    Yes ${issue.yesPrice}%
                </button>
                <button class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                        onclick="showLoginAlert()">
                    No ${noPrice}%
                </button>
            </div>
            
            <div class="pt-4 border-t border-gray-200 flex justify-between items-center">
                <span class="text-sm text-gray-600">총 참여 감</span>
                <span class="font-semibold text-gray-900 flex items-center">
                    <i data-lucide="coins" class="w-4 h-4 mr-1 text-yellow-500"></i>
                    ${formatVolume(issue.totalVolume)}
                </span>
            </div>
        </div>
    `;
}

function getTimeLeft(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    
    if (diff <= 0) return "마감";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return `${days}일 남음`;
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

function showLoginAlert() {
    alert('예측을 하려면 로그인이 필요합니다.');
    window.location.href = 'login.html';
}

console.log('App script loaded successfully');