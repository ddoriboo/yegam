import * as auth from './auth.js';
import * as backend from './backend.js';
import { updateHeader } from './ui/header.js';
import { setupBettingEventListeners } from './ui/betting-handler.js';
import { renderCategoryFilters, setupCategoryFilters, renderFilteredIssues } from './ui/category-filter.js';
import { createIssueCard } from './ui/issue-card.js';
import { setupLoginPage } from './pages/login-page.js';
import { renderMyPage } from './pages/my-page.js';
import { renderAdminPage, setupAdminFunctions } from './pages/admin-page.js';
import { debounce } from '../utils/formatters.js';

// Application state
let currentPage = '';

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializeApplication();
});

async function initializeApplication() {
    try {
        await backend.init();
        updateHeader();
        
        currentPage = getCurrentPage();
        
        switch (currentPage) {
            case 'index':
                await renderHomePage();
                break;
            case 'issues':
                await renderIssuesPage();
                break;
            case 'login':
                setupLoginPage();
                break;
            case 'mypage':
                renderMyPage();
                break;
            case 'admin':
                renderAdminPage();
                setupAdminFunctions();
                break;
            default:
                console.warn('Unknown page:', currentPage);
        }
    } catch (error) {
        console.error('Application initialization failed:', error);
        showErrorMessage('애플리케이션 초기화에 실패했습니다.');
    }
}

function getCurrentPage() {
    const path = window.location.pathname.split("/").pop();
    if (path === 'index.html' || path === '') return 'index';
    if (path === 'issues.html') return 'issues';
    if (path === 'login.html') return 'login';
    if (path === 'mypage.html') return 'mypage';
    if (path === 'admin.html') return 'admin';
    return path.replace('.html', '');
}

async function renderHomePage() {
    renderCategoryFilters();
    await renderPopularIssues();
    setupBettingEventListeners();
    setupCategoryFilters();
}

async function renderIssuesPage() {
    await renderAllIssues();
    setupFilters();
    setupBettingEventListeners();
}

async function renderPopularIssues() {
    const issues = backend.getIssues();
    const popularIssues = issues.filter(issue => issue.isPopular).slice(0, 2);
    const grid = document.getElementById('popular-issues-grid');
    
    if (grid) {
        if (popularIssues.length > 0) {
            grid.innerHTML = popularIssues.map(createIssueCard).join('');
        } else {
            grid.innerHTML = '<div class="col-span-full text-center py-12"><p class="text-gray-500">인기 이슈가 없습니다.</p></div>';
        }
        lucide.createIcons();
    }
}

async function renderAllIssues(filteredIssues) {
    const issues = filteredIssues || backend.getIssues();
    const grid = document.getElementById('all-issues-grid');
    const noResults = document.getElementById('no-results');
    
    if (!grid || !noResults) return;
    
    if (issues.length > 0) {
        grid.innerHTML = issues.map(createIssueCard).join('');
        grid.classList.remove('hidden');
        noResults.classList.add('hidden');
    } else {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');
    }
    
    lucide.createIcons();
}

function setupFilters() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const sortFilter = document.getElementById('sort-filter');
    
    const debouncedFilter = debounce(applyFilters, 300);
    
    searchInput?.addEventListener('input', debouncedFilter);
    categoryFilter?.addEventListener('change', applyFilters);
    sortFilter?.addEventListener('change', applyFilters);
    
    function applyFilters() {
        const issues = backend.getIssues();
        let filtered = [...issues];

        // Search filter
        const searchTerm = searchInput?.value?.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(issue => 
                issue.title.toLowerCase().includes(searchTerm)
            );
        }

        // Category filter
        const category = categoryFilter?.value;
        if (category && category !== 'all') {
            filtered = filtered.filter(issue => issue.category === category);
        }

        // Sort filter
        const sort = sortFilter?.value;
        switch (sort) {
            case 'newest':
                filtered.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
                break;
            case 'ending_soon':
                filtered.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
                break;
            case 'volume':
                filtered.sort((a, b) => b.totalVolume - a.totalVolume);
                break;
            default:
                // Keep original order
                break;
        }

        renderAllIssues(filtered);
    }
}

function showErrorMessage(message) {
    // Create a simple error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg z-50';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Export for global access if needed
window.YegameApp = {
    renderHomePage,
    renderIssuesPage,
    renderPopularIssues,
    renderAllIssues,
    updateHeader
};