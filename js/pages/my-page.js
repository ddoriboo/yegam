import * as auth from '../auth.js';
import * as backend from '../backend.js';

export function renderMyPage() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    if (!auth.isLoggedIn()) {
        renderLoginRequired(mainContent);
        return;
    }

    const user = auth.getCurrentUser();
    const userBets = backend.getUserBets(user.id);
    const issues = backend.getIssues();

    renderUserProfile(mainContent, user, userBets, issues);
}

function renderLoginRequired(container) {
    container.innerHTML = `
        <div class="text-center py-16">
            <i data-lucide="user-cog" class="w-24 h-24 mx-auto text-gray-600"></i>
            <h1 class="mt-8 text-3xl md:text-4xl font-bold text-white">내 정보</h1>
            <p class="mt-4 text-gray-400">이 페이지를 보려면 먼저 <a href="login.html" class="text-blue-400 hover:underline">로그인</a>해주세요.</p>
        </div>
    `;
    lucide.createIcons();
}

function renderUserProfile(container, user, userBets, issues) {
    container.innerHTML = `
        <div class="space-y-12">
            <div>
                <h1 class="text-3xl md:text-4xl font-bold text-white mb-2">내 정보</h1>
                <p class="text-gray-400">프로필 및 코인 보유 현황입니다.</p>
            </div>
            
            ${renderProfileCard(user, userBets)}
            ${renderBettingHistory(userBets, issues)}
        </div>
    `;
    lucide.createIcons();
}

function renderProfileCard(user, userBets) {
    return `
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <div class="md:col-span-1 text-center">
                <i data-lucide="user-circle-2" class="w-24 h-24 mx-auto text-blue-400"></i>
                <h2 class="mt-4 text-2xl font-bold text-white">${user.username}</h2>
                <p class="text-gray-400">${user.email}</p>
            </div>
            <div class="md:col-span-2 grid grid-cols-2 gap-8">
                <div class="bg-gray-700/50 p-6 rounded-lg text-center">
                    <p class="text-sm text-gray-400 mb-2">보유 감</p>
                    <div class="flex items-center justify-center space-x-2">
                         <i data-lucide="coins" class="w-8 h-8 text-yellow-400"></i>
                         <p class="text-3xl font-bold text-white">${user.coins.toLocaleString()}</p>
                    </div>
                </div>
                 <div class="bg-gray-700/50 p-6 rounded-lg text-center">
                    <p class="text-sm text-gray-400 mb-2">총 예측 수</p>
                     <div class="flex items-center justify-center space-x-2">
                         <i data-lucide="ticket" class="w-8 h-8 text-gray-300"></i>
                         <p class="text-3xl font-bold text-white">${userBets.length}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderBettingHistory(userBets, issues) {
    const historyRows = userBets.length > 0 
        ? userBets.map(bet => {
            const issue = issues.find(i => i.id === bet.issueId);
            return `
                <tr>
                    <td class="font-semibold">${issue?.title || 'Unknown Issue'}</td>
                    <td>
                        <span class="px-2 py-1 text-xs font-bold rounded-md ${bet.choice === 'Yes' ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'}">
                            ${bet.choice}
                        </span>
                    </td>
                    <td class="text-gray-300">${bet.amount.toLocaleString()}</td>
                    <td class="text-gray-500 italic">결과 대기 중</td>
                </tr>
            `;
        }).join('')
        : '<tr><td colspan="4" class="text-center text-gray-500 py-8">아직 예측 내역이 없습니다.</td></tr>';

    return `
        <div>
             <h2 class="text-2xl font-bold text-white mb-4">나의 예측 내역</h2>
             <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>이슈</th>
                            <th>나의 예측</th>
                            <th>예측 감</th>
                            <th>결과</th>
                        </tr>
                    </thead>
                    <tbody id="betting-history-body">
                        ${historyRows}
                    </tbody>
                </table>
             </div>
        </div>
    `;
}