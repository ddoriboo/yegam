const { authRequest } = require('./lib/api-client');

const issueIds = [121, 122, 123];
const newBettingEnd = '2026-02-01T10:30:00';
const newEndDate = '2026-02-01T12:30:00';

(async () => {
  // 먼저 모든 이슈 가져오기
  const { issues } = await authRequest('/api/issues');
  
  for (const id of issueIds) {
    const issue = issues.find(i => i.id === id);
    if (!issue) {
      console.log('Issue', id, ': not found');
      continue;
    }
    
    try {
      const res = await authRequest('/api/admin/issues/' + id, {
        method: 'PUT',
        body: JSON.stringify({
          title: issue.title,
          category: issue.category,
          description: issue.description || '',
          betting_end_date: newBettingEnd,
          end_date: newEndDate,
          is_popular: issue.is_popular
        })
      });
      console.log('Issue', id, ':', res.success ? 'OK' : res.message);
    } catch (e) {
      console.log('Issue', id, 'error:', e.message || JSON.stringify(e));
    }
  }
})();
