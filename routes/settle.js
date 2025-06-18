const express = require('express');
const router = express.Router();
const { getDB } = require('../database/init');
const gamService = require('../services/gamService');

// 이슈 정산 (관리자만 호출)
router.post('/issue/:issueId', async (req, res) => {
    const { issueId } = req.params;
    const { correctAnswer } = req.body; // 'yes' 또는 'no'
    
    if (!correctAnswer || !['yes', 'no'].includes(correctAnswer)) {
        return res.status(400).json({ error: '올바른 정답을 입력해주세요.' });
    }
    
    try {
        const db = getDB();
        
        // 이슈 상태 확인
        db.get('SELECT * FROM issues WHERE id = ?', [issueId], async (err, issue) => {
            if (err) {
                console.error('이슈 조회 실패:', err);
                return res.status(500).json({ error: '이슈 조회에 실패했습니다.' });
            }
            
            if (!issue) {
                return res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
            }
            
            if (issue.status === 'settled') {
                return res.status(400).json({ error: '이미 정산된 이슈입니다.' });
            }
            
            try {
                // 베팅 데이터 조회
                db.all('SELECT * FROM bets WHERE issue_id = ?', [issueId], async (err, bets) => {
                    if (err) {
                        console.error('베팅 데이터 조회 실패:', err);
                        return res.status(500).json({ error: '베팅 데이터 조회에 실패했습니다.' });
                    }
                    
                    // 총 베팅 금액 계산
                    const totalYesAmount = bets.filter(bet => bet.choice === 'yes').reduce((sum, bet) => sum + bet.amount, 0);
                    const totalNoAmount = bets.filter(bet => bet.choice === 'no').reduce((sum, bet) => sum + bet.amount, 0);
                    const totalAmount = totalYesAmount + totalNoAmount;
                    
                    if (totalAmount === 0) {
                        // 베팅이 없는 경우
                        db.run('UPDATE issues SET status = ?, correct_answer = ? WHERE id = ?', 
                               ['settled', correctAnswer, issueId], (err) => {
                            if (err) {
                                console.error('이슈 상태 업데이트 실패:', err);
                                return res.status(500).json({ error: '이슈 상태 업데이트에 실패했습니다.' });
                            }
                            res.json({ success: true, message: '정산이 완료되었습니다.' });
                        });
                        return;
                    }
                    
                    // 승리자와 패배자 분류
                    const winners = bets.filter(bet => bet.choice === correctAnswer);
                    const losers = bets.filter(bet => bet.choice !== correctAnswer);
                    
                    const winnerAmount = correctAnswer === 'yes' ? totalYesAmount : totalNoAmount;
                    const loserAmount = correctAnswer === 'yes' ? totalNoAmount : totalYesAmount;
                    
                    try {
                        // 패배자 처리 (이미 베팅 시 감이 차감되었으므로 추가 처리 불필요)
                        for (const loser of losers) {
                            // 베팅 실패 트랜잭션은 이미 베팅 시점에 기록됨
                            console.log(`사용자 ${loser.user_id}: 베팅 실패 (${loser.amount}감)`);
                        }
                        
                        // 승리자 처리
                        for (const winner of winners) {
                            if (winnerAmount === 0) continue;
                            
                            // 승리 비율에 따른 수익 계산
                            const winRatio = winner.amount / winnerAmount;
                            const profit = Math.floor(loserAmount * winRatio);
                            const totalWinAmount = winner.amount + profit; // 원금 + 수익
                            
                            // 수수료 계산 (총 획득액의 2%)
                            const commission = Math.floor(totalWinAmount * 0.02);
                            const finalAmount = totalWinAmount - commission;
                            
                            // 감 지급 (원금은 이미 차감되어 있으므로 최종 획득액만 지급)
                            await gamService.earnGam(winner.user_id, 'betting_win', finalAmount, 
                                `베팅 승리 (원금: ${winner.amount}, 수익: ${profit}, 수수료: ${commission})`, issueId);
                            
                            // 수수료 기록 (시스템에서 회수)
                            if (commission > 0) {
                                await gamService.burnGam(winner.user_id, 'commission', commission, 
                                    '베팅 승리 수수료 (2%)', issueId);
                            }
                            
                            // 정확한 예측 횟수 증가
                            db.run('UPDATE users SET correct_predictions = correct_predictions + 1 WHERE id = ?', 
                                   [winner.user_id], (err) => {
                                if (err) {
                                    console.error('사용자 통계 업데이트 실패:', err);
                                }
                            });
                            
                            console.log(`사용자 ${winner.user_id}: 베팅 승리 (${finalAmount}감 획득, 수수료 ${commission}감)`);
                        }
                        
                        // 이슈 상태 업데이트
                        db.run('UPDATE issues SET status = ?, correct_answer = ? WHERE id = ?', 
                               ['settled', correctAnswer, issueId], (err) => {
                            if (err) {
                                console.error('이슈 상태 업데이트 실패:', err);
                                return res.status(500).json({ error: '이슈 상태 업데이트에 실패했습니다.' });
                            }
                            
                            // 모든 참여자의 업적 확인
                            const allParticipants = [...new Set(bets.map(bet => bet.user_id))];
                            allParticipants.forEach(async (userId) => {
                                try {
                                    const achievements = await gamService.checkAndRewardAchievements(userId);
                                    if (achievements.length > 0) {
                                        console.log(`사용자 ${userId}가 업적을 달성했습니다:`, achievements.map(a => a.name));
                                    }
                                } catch (error) {
                                    console.error(`사용자 ${userId} 업적 확인 실패:`, error);
                                }
                            });
                            
                            res.json({ 
                                success: true, 
                                message: '정산이 완료되었습니다.',
                                stats: {
                                    totalBets: bets.length,
                                    totalAmount: totalAmount,
                                    winners: winners.length,
                                    losers: losers.length,
                                    correctAnswer: correctAnswer
                                }
                            });
                        });
                        
                    } catch (error) {
                        console.error('정산 처리 중 오류:', error);
                        res.status(500).json({ error: '정산 처리에 실패했습니다.' });
                    }
                });
                
            } catch (error) {
                console.error('정산 처리 중 오류:', error);
                res.status(500).json({ error: '정산 처리에 실패했습니다.' });
            }
        });
        
    } catch (error) {
        console.error('정산 처리 중 오류:', error);
        res.status(500).json({ error: '정산 처리에 실패했습니다.' });
    }
});

// 베스트 댓글 보상 지급
router.post('/best-comment/:issueId', async (req, res) => {
    const { issueId } = req.params;
    
    try {
        const db = getDB();
        
        // 해당 이슈의 댓글 중 추천을 가장 많이 받은 댓글 찾기
        db.get(`
            SELECT user_id, MAX(likes) as max_likes 
            FROM comments 
            WHERE issue_id = ? AND likes > 0
            GROUP BY user_id
            ORDER BY max_likes DESC
            LIMIT 1
        `, [issueId], async (err, bestComment) => {
            if (err) {
                console.error('베스트 댓글 조회 실패:', err);
                return res.status(500).json({ error: '베스트 댓글 조회에 실패했습니다.' });
            }
            
            if (!bestComment) {
                return res.json({ success: false, message: '베스트 댓글이 없습니다.' });
            }
            
            try {
                // 베스트 댓글 보상 지급
                await gamService.earnGam(bestComment.user_id, 'best_comment', 500, 
                    '베스트 댓글 보상', issueId);
                
                res.json({ 
                    success: true, 
                    message: '베스트 댓글 보상이 지급되었습니다.',
                    userId: bestComment.user_id,
                    likes: bestComment.max_likes
                });
                
            } catch (error) {
                console.error('베스트 댓글 보상 지급 실패:', error);
                res.status(500).json({ error: '베스트 댓글 보상 지급에 실패했습니다.' });
            }
        });
        
    } catch (error) {
        console.error('베스트 댓글 보상 처리 중 오류:', error);
        res.status(500).json({ error: '베스트 댓글 보상 처리에 실패했습니다.' });
    }
});

module.exports = router;