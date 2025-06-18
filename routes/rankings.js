const express = require('express');
const router = express.Router();
const { getDB } = require('../database/init');
const gamService = require('../services/gamService');

// 현재 주간 랭킹 조회
router.get('/weekly', (req, res) => {
    const db = getDB();
    
    // 이번 주 시작일과 종료일 계산
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // 일요일로 설정
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const query = `
        SELECT 
            u.id,
            u.username,
            u.profile_image,
            COUNT(b.id) as total_bets,
            SUM(b.amount) as total_volume,
            SUM(CASE 
                WHEN i.correct_answer = b.choice AND i.status = 'settled' 
                THEN b.amount * (1 + (SELECT SUM(b2.amount) FROM bets b2 WHERE b2.issue_id = i.id AND b2.choice != b.choice) / 
                    (SELECT SUM(b3.amount) FROM bets b3 WHERE b3.issue_id = i.id AND b3.choice = b.choice)) * 0.98
                ELSE 0 
            END) as total_winnings,
            SUM(CASE 
                WHEN i.correct_answer != b.choice AND i.status = 'settled' 
                THEN b.amount 
                ELSE 0 
            END) as total_losses,
            (SUM(CASE 
                WHEN i.correct_answer = b.choice AND i.status = 'settled' 
                THEN b.amount * (1 + (SELECT SUM(b2.amount) FROM bets b2 WHERE b2.issue_id = i.id AND b2.choice != b.choice) / 
                    (SELECT SUM(b3.amount) FROM bets b3 WHERE b3.issue_id = i.id AND b3.choice = b.choice)) * 0.98
                ELSE 0 
            END) - SUM(CASE 
                WHEN i.correct_answer != b.choice AND i.status = 'settled' 
                THEN b.amount 
                ELSE 0 
            END)) as net_profit,
            CASE 
                WHEN SUM(b.amount) > 0 
                THEN ((SUM(CASE 
                    WHEN i.correct_answer = b.choice AND i.status = 'settled' 
                    THEN b.amount * (1 + (SELECT SUM(b2.amount) FROM bets b2 WHERE b2.issue_id = i.id AND b2.choice != b.choice) / 
                        (SELECT SUM(b3.amount) FROM bets b3 WHERE b3.issue_id = i.id AND b3.choice = b.choice)) * 0.98
                    ELSE 0 
                END) - SUM(CASE 
                    WHEN i.correct_answer != b.choice AND i.status = 'settled' 
                    THEN b.amount 
                    ELSE 0 
                END)) / SUM(b.amount)) * 100
                ELSE 0 
            END as profit_rate
        FROM users u
        LEFT JOIN bets b ON u.id = b.user_id 
            AND b.created_at >= ? AND b.created_at <= ?
        LEFT JOIN issues i ON b.issue_id = i.id AND i.status = 'settled'
        WHERE b.id IS NOT NULL
        GROUP BY u.id, u.username, u.profile_image
        HAVING total_volume >= 1000
        ORDER BY profit_rate DESC, total_volume DESC
        LIMIT 50
    `;
    
    db.all(query, [startOfWeek.toISOString(), endOfWeek.toISOString()], (err, rankings) => {
        if (err) {
            console.error('주간 랭킹 조회 실패:', err);
            return res.status(500).json({ error: '주간 랭킹 조회에 실패했습니다.' });
        }
        
        // 랭킹 번호 추가
        const rankedResults = rankings.map((user, index) => ({
            ...user,
            rank: index + 1,
            profit_rate: Math.round(user.profit_rate * 100) / 100 // 소수점 2자리로 반올림
        }));
        
        res.json({
            weekStart: startOfWeek.toISOString().split('T')[0],
            weekEnd: endOfWeek.toISOString().split('T')[0],
            rankings: rankedResults
        });
    });
});

// 과거 주간 랭킹 조회
router.get('/weekly/history', (req, res) => {
    const { week } = req.query; // YYYY-MM-DD 형식
    const db = getDB();
    
    if (!week) {
        return res.status(400).json({ error: '주차 정보가 필요합니다.' });
    }
    
    const weekStart = new Date(week);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const query = `
        SELECT 
            u.username,
            u.profile_image,
            wr.rank_position,
            wr.profit_rate,
            wr.total_volume,
            wr.reward_gam
        FROM weekly_rankings wr
        JOIN users u ON wr.user_id = u.id
        WHERE wr.week_start = ? AND wr.week_end = ?
        ORDER BY wr.rank_position ASC
    `;
    
    db.all(query, [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]], (err, rankings) => {
        if (err) {
            console.error('과거 주간 랭킹 조회 실패:', err);
            return res.status(500).json({ error: '과거 주간 랭킹 조회에 실패했습니다.' });
        }
        
        res.json({
            weekStart: weekStart.toISOString().split('T')[0],
            weekEnd: weekEnd.toISOString().split('T')[0],
            rankings: rankings
        });
    });
});

// 주간 랭킹 정산 (관리자용 - 매주 실행)
router.post('/weekly/settle', async (req, res) => {
    const { weekStart } = req.body; // YYYY-MM-DD 형식
    
    if (!weekStart) {
        return res.status(400).json({ error: '주차 시작일이 필요합니다.' });
    }
    
    try {
        const db = getDB();
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        
        // 해당 주차가 이미 정산되었는지 확인
        db.get('SELECT COUNT(*) as count FROM weekly_rankings WHERE week_start = ?', 
               [startDate.toISOString().split('T')[0]], (err, result) => {
            if (err) {
                console.error('주간 랭킹 확인 실패:', err);
                return res.status(500).json({ error: '주간 랭킹 확인에 실패했습니다.' });
            }
            
            if (result.count > 0) {
                return res.status(400).json({ error: '이미 정산된 주차입니다.' });
            }
            
            // 주간 랭킹 계산 (위의 쿼리와 동일)
            const rankingQuery = `
                SELECT 
                    u.id as user_id,
                    u.username,
                    COUNT(b.id) as total_bets,
                    SUM(b.amount) as total_volume,
                    CASE 
                        WHEN SUM(b.amount) > 0 
                        THEN ((SUM(CASE 
                            WHEN i.correct_answer = b.choice AND i.status = 'settled' 
                            THEN b.amount * (1 + (SELECT SUM(b2.amount) FROM bets b2 WHERE b2.issue_id = i.id AND b2.choice != b.choice) / 
                                (SELECT SUM(b3.amount) FROM bets b3 WHERE b3.issue_id = i.id AND b3.choice = b.choice)) * 0.98
                            ELSE 0 
                        END) - SUM(CASE 
                            WHEN i.correct_answer != b.choice AND i.status = 'settled' 
                            THEN b.amount 
                            ELSE 0 
                        END)) / SUM(b.amount)) * 100
                        ELSE 0 
                    END as profit_rate
                FROM users u
                LEFT JOIN bets b ON u.id = b.user_id 
                    AND b.created_at >= ? AND b.created_at <= ?
                LEFT JOIN issues i ON b.issue_id = i.id AND i.status = 'settled'
                WHERE b.id IS NOT NULL
                GROUP BY u.id, u.username
                HAVING total_volume >= 1000
                ORDER BY profit_rate DESC, total_volume DESC
                LIMIT 50
            `;
            
            db.all(rankingQuery, [startDate.toISOString(), endDate.toISOString()], async (err, rankings) => {
                if (err) {
                    console.error('주간 랭킹 계산 실패:', err);
                    return res.status(500).json({ error: '주간 랭킹 계산에 실패했습니다.' });
                }
                
                if (rankings.length === 0) {
                    return res.json({ success: true, message: '랭킹 대상자가 없습니다.' });
                }
                
                try {
                    // 보상 계산 함수
                    const calculateReward = (rank) => {
                        if (rank === 1) return 50000;
                        if (rank <= 3) return 30000;
                        if (rank <= 5) return 20000;
                        if (rank <= 10) return 10000;
                        if (rank <= 20) return 5000;
                        if (rank <= 30) return 3000;
                        if (rank <= 50) return 2000;
                        return 0;
                    };
                    
                    // 랭킹 기록 및 보상 지급
                    for (let i = 0; i < rankings.length; i++) {
                        const user = rankings[i];
                        const rank = i + 1;
                        const reward = calculateReward(rank);
                        
                        // 랭킹 기록 저장
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO weekly_rankings 
                                 (user_id, week_start, week_end, profit_rate, total_volume, rank_position, reward_gam)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    user.user_id,
                                    startDate.toISOString().split('T')[0],
                                    endDate.toISOString().split('T')[0],
                                    user.profit_rate,
                                    user.total_volume,
                                    rank,
                                    reward
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                        
                        // 보상 지급
                        if (reward > 0) {
                            await gamService.earnGam(
                                user.user_id, 
                                'weekly_ranking', 
                                reward, 
                                `주간 랭킹 ${rank}위 보상`,
                                null
                            );
                        }
                    }
                    
                    res.json({
                        success: true,
                        message: '주간 랭킹 정산이 완료되었습니다.',
                        stats: {
                            totalParticipants: rankings.length,
                            totalRewards: rankings.reduce((sum, user, index) => 
                                sum + calculateReward(index + 1), 0
                            ),
                            weekStart: startDate.toISOString().split('T')[0],
                            weekEnd: endDate.toISOString().split('T')[0]
                        }
                    });
                    
                } catch (error) {
                    console.error('주간 랭킹 정산 처리 실패:', error);
                    res.status(500).json({ error: '주간 랭킹 정산 처리에 실패했습니다.' });
                }
            });
        });
        
    } catch (error) {
        console.error('주간 랭킹 정산 실패:', error);
        res.status(500).json({ error: '주간 랭킹 정산에 실패했습니다.' });
    }
});

// 사용자별 랭킹 히스토리
router.get('/user/:userId/history', (req, res) => {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    const db = getDB();
    
    const query = `
        SELECT 
            week_start,
            week_end,
            rank_position,
            profit_rate,
            total_volume,
            reward_gam
        FROM weekly_rankings
        WHERE user_id = ?
        ORDER BY week_start DESC
        LIMIT ?
    `;
    
    db.all(query, [userId, parseInt(limit)], (err, history) => {
        if (err) {
            console.error('사용자 랭킹 히스토리 조회 실패:', err);
            return res.status(500).json({ error: '사용자 랭킹 히스토리 조회에 실패했습니다.' });
        }
        
        res.json(history);
    });
});

// 전체 랭킹 통계
router.get('/stats', (req, res) => {
    const db = getDB();
    
    const query = `
        SELECT 
            COUNT(DISTINCT user_id) as total_participants,
            COUNT(DISTINCT week_start) as total_weeks,
            SUM(reward_gam) as total_rewards_distributed,
            AVG(profit_rate) as avg_profit_rate,
            MAX(profit_rate) as max_profit_rate,
            MIN(profit_rate) as min_profit_rate
        FROM weekly_rankings
    `;
    
    db.get(query, (err, stats) => {
        if (err) {
            console.error('랭킹 통계 조회 실패:', err);
            return res.status(500).json({ error: '랭킹 통계 조회에 실패했습니다.' });
        }
        
        res.json({
            ...stats,
            avg_profit_rate: Math.round(stats.avg_profit_rate * 100) / 100,
            max_profit_rate: Math.round(stats.max_profit_rate * 100) / 100,
            min_profit_rate: Math.round(stats.min_profit_rate * 100) / 100
        });
    });
});

module.exports = router;