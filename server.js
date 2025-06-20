const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const issueRequestRoutes = require('./routes/issue-requests');
const betRoutes = require('./routes/bets');
const commentRoutes = require('./routes/comments');
const adminCommentRoutes = require('./routes/admin-comments');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/admin-auth');
const { router: secureAdminAuthRoutes } = require('./routes/admin-auth-secure');
const uploadRoutes = require('./routes/upload');
const { initDatabase } = require('./database/database');
const issueScheduler = require('./services/scheduler');
const { errorHandler } = require('./middleware/errorHandler');
const { setupAdminEndpoint } = require('./setup-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 버전 정보 - PostgreSQL 완전 통일 버전
console.log('🚀 예겜 서버 v2.0 - PostgreSQL 완전 통일 버전');

// 미들웨어 (개발/프로덕션 환경에 따라 보안 설정 조정)
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: false, // CSP 비활성화로 일단 해결
        crossOriginEmbedderPolicy: false
    }));
} else {
    app.use(helmet({ contentSecurityPolicy: false }));
}
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// API 라우트
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/issue-requests', issueRequestRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/admin/comments', adminCommentRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin-auth', secureAdminAuthRoutes); // 보안 관리자 인증 API
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// 관리자 초기 설정 엔드포인트 (임시)
setupAdminEndpoint(app);

// Cloudinary를 사용하므로 로컬 파일 서빙 불필요

// 프론트엔드 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/setup-admin', async (req, res) => {
    try {
        const { query } = require('./database/database');
        
        // 관리자 테이블이 이미 있는지 확인
        try {
            const existingAdmin = await query('SELECT id FROM admins LIMIT 1');
            if (existingAdmin.rows.length > 0) {
                return res.json({
                    success: false,
                    message: '관리자 계정이 이미 존재합니다.',
                    instruction: req.protocol + '://' + req.get('host') + '/admin-login 에서 로그인하세요.',
                    loginInfo: {
                        url: req.protocol + '://' + req.get('host') + '/admin-login',
                        username: 'superadmin',
                        password: 'TempAdmin2025!'
                    }
                });
            }
        } catch (e) {
            // 테이블이 없으면 생성
        }

        const bcrypt = require('bcryptjs');
        const defaultPassword = 'TempAdmin2025!';
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);
        
        // 관리자 테이블 생성
        await query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                role VARCHAR(20) DEFAULT 'admin',
                is_active BOOLEAN DEFAULT true,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 관리자 세션 테이블
        await query(`
            CREATE TABLE IF NOT EXISTS admin_sessions (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
                token_hash VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                ip_address INET,
                user_agent TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 관리자 활동 로그 테이블
        await query(`
            CREATE TABLE IF NOT EXISTS admin_activity_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id INTEGER,
                details JSONB,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 기본 관리자 계정 생성
        const result = await query(`
            INSERT INTO admins (username, email, password_hash, full_name, role) 
            VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (username) DO UPDATE SET 
                password_hash = EXCLUDED.password_hash,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, ['superadmin', 'admin@yegam.com', hashedPassword, '시스템 관리자', 'super_admin']);
        
        res.json({
            success: true,
            message: '관리자 계정이 성공적으로 생성되었습니다!',
            adminId: result.rows[0].id,
            loginInfo: {
                url: req.protocol + '://' + req.get('host') + '/admin-login',
                username: 'superadmin',
                password: defaultPassword,
                warning: '⚠️ 로그인 후 즉시 비밀번호를 변경하세요!'
            }
        });
        
    } catch (error) {
        console.error('Setup admin error:', error);
        res.status(500).json({
            success: false,
            message: '관리자 설정 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/issues', (req, res) => {
    res.sendFile(path.join(__dirname, 'issues.html'));
});

app.get('/mypage', (req, res) => {
    res.sendFile(path.join(__dirname, 'mypage.html'));
});

app.get('/tier_guide', (req, res) => {
    res.sendFile(path.join(__dirname, 'tier_guide.html'));
});

// 404 핸들러
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: '요청하신 페이지를 찾을 수 없습니다.'
    });
});

// 전역 에러 핸들러
app.use(errorHandler);

// 데이터베이스 초기화 후 서버 시작
console.log('🔄 데이터베이스 초기화 시작...');
initDatabase().then(() => {
    console.log('✅ 데이터베이스 초기화 완료');
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 예겜 서버가 포트 ${PORT}에서 실행 중입니다.`);
        if (process.env.NODE_ENV === 'production') {
            console.log(`🌐 Railway 공개 URL에서 접속하세요.`);
            console.log(`📍 Railway 대시보드에서 공개 URL을 확인하세요.`);
        } else {
            console.log(`🌐 http://localhost:${PORT} 에서 접속하세요.`);
        }
        
        // 이슈 자동 마감 스케줄러 시작
        try {
            console.log('🔄 스케줄러 초기화 중...');
            issueScheduler.start();
            console.log('✅ 스케줄러 시작 성공');
        } catch (schedulerError) {
            console.error('❌ 스케줄러 시작 실패:', schedulerError);
            console.error('❌ 서버는 계속 실행되지만 스케줄러는 비활성화됩니다.');
        }
        
        // 데이터베이스 연결 상태 재확인
        try {
            const { getDB } = require('./database/database');
            const testDb = getDB();
            if (testDb) {
                console.log('✅ 서버 시작 후 데이터베이스 연결 확인됨');
            } else {
                console.error('❌ 서버 시작 후 데이터베이스 연결 실패');
            }
        } catch (dbTestError) {
            console.error('❌ 데이터베이스 연결 테스트 실패:', dbTestError);
        }
    });
}).catch(err => {
    console.error('❌ 데이터베이스 초기화 실패:', err);
    console.error('❌ 에러 메시지:', err.message);
    console.error('❌ 에러 세부사항:', err.stack);
    console.error('❌ 환경 변수 확인:', {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? '***설정됨***' : '설정되지 않음',
        PORT: process.env.PORT
    });
    
    // 에러가 있어도 서버는 시작해서 디버깅할 수 있게 함
    console.log('⚠️ 데이터베이스 초기화 실패했지만 서버를 시작합니다...');
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다 (DB 연결 실패 상태)`);
    });
});