const express = require('express');
const router = express.Router();
const { getClient } = require('../database/postgres');
const { v4: uuidv4 } = require('uuid');

router.post('/track', async (req, res) => {
    let client;
    try {
        const { page_url, user_agent, referrer } = req.body;
        const user_id = req.user?.id || null;
        const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
        
        let session_id = req.session?.visitor_session_id;
        if (!session_id) {
            session_id = uuidv4();
            if (req.session) {
                req.session.visitor_session_id = session_id;
            }
        }
        
        client = await getClient();
        
        const query = `
            INSERT INTO visitor_tracking (
                user_id, ip_address, user_agent, page_url, session_id
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
        
        const result = await client.query(query, [
            user_id, ip_address, user_agent, page_url, session_id
        ]);
        
        res.json({ 
            success: true, 
            visit_id: result.rows[0].id,
            session_id 
        });
        
    } catch (error) {
        console.error('방문자 트래킹 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '방문자 정보 기록 실패' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

router.get('/stats/today', async (req, res) => {
    let client;
    try {
        client = await getClient();
        
        const result = await client.query('SELECT * FROM get_today_visitors()');
        const stats = result.rows[0];
        
        res.json({
            success: true,
            today: {
                unique_visitors: parseInt(stats.unique_visitors),
                total_page_views: parseInt(stats.total_page_views)
            }
        });
        
    } catch (error) {
        console.error('오늘 방문자 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '방문자 통계 조회 실패' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

router.get('/stats/total', async (req, res) => {
    let client;
    try {
        client = await getClient();
        
        const result = await client.query('SELECT * FROM get_total_visitors()');
        const stats = result.rows[0];
        
        res.json({
            success: true,
            total: {
                unique_visitors: parseInt(stats.unique_visitors),
                total_page_views: parseInt(stats.total_page_views)
            }
        });
        
    } catch (error) {
        console.error('전체 방문자 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '방문자 통계 조회 실패' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

router.get('/stats/daily', async (req, res) => {
    let client;
    try {
        const { days = 30 } = req.query;
        client = await getClient();
        
        const query = `
            SELECT 
                visit_date,
                unique_visitors,
                total_page_views
            FROM daily_visitor_stats
            WHERE visit_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            ORDER BY visit_date DESC
        `;
        
        const result = await client.query(query);
        
        res.json({
            success: true,
            daily_stats: result.rows
        });
        
    } catch (error) {
        console.error('일별 방문자 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '일별 방문자 통계 조회 실패' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

router.get('/stats/admin', async (req, res) => {
    let client;
    try {
        client = await getClient();
        
        const [todayResult, totalResult, recentResult] = await Promise.all([
            client.query('SELECT * FROM get_today_visitors()'),
            client.query('SELECT * FROM get_total_visitors()'),
            client.query(`
                SELECT 
                    visit_date,
                    unique_visitors,
                    total_page_views
                FROM daily_visitor_stats
                WHERE visit_date >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY visit_date DESC
            `)
        ]);
        
        const todayStats = todayResult.rows[0];
        const totalStats = totalResult.rows[0];
        
        res.json({
            success: true,
            today: {
                unique_visitors: parseInt(todayStats.unique_visitors),
                total_page_views: parseInt(todayStats.total_page_views)
            },
            total: {
                unique_visitors: parseInt(totalStats.unique_visitors),
                total_page_views: parseInt(totalStats.total_page_views)
            },
            recent_7_days: recentResult.rows
        });
        
    } catch (error) {
        console.error('관리자 방문자 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '관리자 방문자 통계 조회 실패' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

module.exports = router;