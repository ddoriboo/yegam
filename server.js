const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// 환경변수 검증 (서버 시작 전 실행)
const EnvironmentValidator = require('./utils/env-validator');
const envConfig = EnvironmentValidator.validate();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const issueRequestRoutes = require('./routes/issue-requests');
const betRoutes = require('./routes/bets');
const commentRoutes = require('./routes/comments');
const adminCommentRoutes = require('./routes/admin-comments');
const adminRoutes = require('./routes/admin');
const { router: secureAdminAuthRoutes } = require('./routes/admin-auth-secure');
const uploadRoutes = require('./routes/upload');
const { initDatabase } = require('./database/database');
const issueScheduler = require('./services/scheduler');
const { errorHandler } = require('./middleware/errorHandler');
const HealthCheck = require('./utils/health-check');

const app = express();
const PORT = envConfig.port || 3000;

// 헬스체크 인스턴스 생성
const healthCheck = new HealthCheck();

// 버전 정보 - PostgreSQL 완전 통일 버전
console.log('🚀 예겜 서버 v2.1 - 보안 및 모니터링 강화 버전');

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

// 헬스체크 및 모니터링 라우트
app.get('/health', async (req, res) => {
    try {
        const result = await healthCheck.quickCheck();
        const statusCode = result.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

app.get('/health/detailed', async (req, res) => {
    try {
        const result = await healthCheck.performHealthCheck();
        const statusCode = result.status === 'healthy' ? 200 : 
                          result.status === 'warning' ? 200 : 503;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

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

// 관리자 초기 설정은 /setup-admin 엔드포인트에서 처리

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

// 테이블 구조 진단 엔드포인트
app.get('/diagnose-admin', async (req, res) => {
    try {
        const { query } = require('./database/database');
        
        const diagnosis = {};
        
        // 현재 테이블들 확인
        try {
            const tables = await query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name LIKE '%admin%'
            `);
            diagnosis.existingTables = tables.rows;
        } catch (e) {
            diagnosis.tableCheckError = e.message;
        }
        
        // admins 테이블 컬럼 구조 확인
        try {
            const columns = await query(`
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'admins'
            `);
            diagnosis.adminsColumns = columns.rows;
        } catch (e) {
            diagnosis.adminsColumnError = e.message;
        }
        
        // 실제 데이터 확인
        try {
            const data = await query('SELECT * FROM admins LIMIT 1');
            diagnosis.sampleData = data.rows;
        } catch (e) {
            diagnosis.dataError = e.message;
        }
        
        res.json({
            success: true,
            diagnosis: diagnosis
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '진단 중 오류 발생',
            error: error.message
        });
    }
});

app.get('/setup-admin', async (req, res) => {
    try {
        const { query } = require('./database/database');
        
        // 현재 admins 테이블 구조 확인
        let needsRecreation = false;
        try {
            const columns = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'admins' AND column_name = 'username'
            `);
            
            if (columns.rows.length === 0) {
                console.log('admins 테이블에 username 컬럼이 없습니다. 테이블을 재생성합니다.');
                needsRecreation = true;
            }
        } catch (e) {
            console.log('테이블 구조 확인 오류:', e.message);
            needsRecreation = true;
        }
        
        if (needsRecreation) {
            // 강제로 테이블들 삭제
            try {
                await query('DROP TABLE IF EXISTS admin_activity_logs CASCADE');
                await query('DROP TABLE IF EXISTS admin_sessions CASCADE'); 
                await query('DROP TABLE IF EXISTS admins CASCADE');
                console.log('기존 관리자 테이블들을 강제 삭제했습니다.');
            } catch (e) {
                console.log('테이블 삭제 중 오류:', e.message);
            }
        } else {
            // username 컬럼이 있다면 기존 계정 확인
            try {
                const existingAdmin = await query('SELECT id, username FROM admins LIMIT 1');
                if (existingAdmin.rows.length > 0) {
                    return res.json({
                        success: false,
                        message: '관리자 계정이 이미 존재합니다.',
                        existingAdmin: existingAdmin.rows[0],
                        loginInfo: {
                            url: req.protocol + '://' + req.get('host') + '/admin-login',
                            username: 'superadmin',
                            password: 'TempAdmin2025!'
                        }
                    });
                }
            } catch (e) {
                console.log('기존 계정 확인 오류:', e.message);
            }
        }

        const bcrypt = require('bcryptjs');
        const defaultPassword = 'TempAdmin2025!';
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);
        
        // 관리자 테이블 생성 (새로운 구조)
        await query(`
            CREATE TABLE admins (
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
            CREATE TABLE admin_sessions (
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
            CREATE TABLE admin_activity_logs (
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
            RETURNING id
        `, ['superadmin', 'admin@yegam.com', hashedPassword, '시스템 관리자', 'super_admin']);
        
        console.log('관리자 계정 생성 완료:', result.rows[0]);
        
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

// API 엔드포인트 테스트
app.get('/test-admin-auth', (req, res) => {
    res.json({
        success: true,
        message: '관리자 인증 API 엔드포인트가 작동합니다.',
        availableRoutes: [
            'POST /api/admin-auth/login',
            'GET /api/admin-auth/verify',
            'POST /api/admin-auth/logout'
        ],
        timestamp: new Date().toISOString()
    });
});

// 관리자 세션 테이블 확인 엔드포인트
app.get('/debug-admin-sessions', async (req, res) => {
    try {
        const { query } = require('./database/database');
        
        // 테이블 존재 확인
        const tableExists = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'admin_sessions'
            );
        `);
        
        console.log('admin_sessions 테이블 존재 여부:', tableExists.rows[0].exists);
        
        if (tableExists.rows[0].exists) {
            // 활성 세션 개수 확인
            const sessionCount = await query(`
                SELECT COUNT(*) as count FROM admin_sessions 
                WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP
            `);
            
            // 최근 세션 조회
            const recentSessions = await query(`
                SELECT s.admin_id, s.expires_at, s.created_at, a.username
                FROM admin_sessions s 
                JOIN admins a ON s.admin_id = a.id
                ORDER BY s.created_at DESC 
                LIMIT 5
            `);
            
            res.json({
                success: true,
                tableExists: true,
                activeSessionCount: sessionCount.rows[0].count,
                recentSessions: recentSessions.rows
            });
        } else {
            res.json({
                success: false,
                tableExists: false,
                message: 'admin_sessions 테이블이 존재하지 않습니다.'
            });
        }
        
    } catch (error) {
        console.error('Admin sessions debug error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 관리자 테이블 강제 수정 엔드포인트
app.get('/fix-admin-table', async (req, res) => {
    try {
        const { query } = require('./database/database');
        const bcrypt = require('bcryptjs');
        
        const steps = [];
        
        // Step 1: user_id 컬럼 문제 해결 (NULL 허용으로 변경)
        try {
            await query('ALTER TABLE admins ALTER COLUMN user_id DROP NOT NULL');
            steps.push('user_id 컬럼 NOT NULL 제약 조건 제거 성공');
        } catch (e) {
            steps.push(`user_id 컬럼 수정 실패: ${e.message}`);
        }
        
        // Step 2: 기존 테이블에 username 컬럼 추가 시도
        try {
            await query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE');
            steps.push('username 컬럼 추가 성공');
        } catch (e) {
            steps.push(`username 컬럼 추가 실패: ${e.message}`);
        }
        
        // Step 3: 다른 필요한 컬럼들 추가
        const columnsToAdd = [
            'email VARCHAR(100) UNIQUE',
            'password_hash VARCHAR(255)',
            'full_name VARCHAR(100)',
            'role VARCHAR(20) DEFAULT \'admin\'',
            'is_active BOOLEAN DEFAULT true',
            'last_login TIMESTAMP',
            'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ];
        
        for (const column of columnsToAdd) {
            try {
                const columnName = column.split(' ')[0];
                await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS ${column}`);
                steps.push(`${columnName} 컬럼 추가 성공`);
            } catch (e) {
                steps.push(`${column} 컬럼 추가 실패: ${e.message}`);
            }
        }
        
        // Step 4: 관리자 계정 생성 시도
        try {
            const defaultPassword = 'TempAdmin2025!';
            const hashedPassword = await bcrypt.hash(defaultPassword, 12);
            
            const result = await query(`
                INSERT INTO admins (username, email, password_hash, full_name, role) 
                VALUES ($1, $2, $3, $4, $5) 
                ON CONFLICT (username) DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `, ['superadmin', 'admin@yegam.com', hashedPassword, '시스템 관리자', 'super_admin']);
            
            steps.push(`관리자 계정 생성/업데이트 성공: ID ${result.rows[0].id}`);
            
            res.json({
                success: true,
                message: '관리자 테이블 수정 및 계정 생성 완료',
                steps: steps,
                loginInfo: {
                    url: req.protocol + '://' + req.get('host') + '/admin-login',
                    username: 'superadmin',
                    password: defaultPassword
                }
            });
            
        } catch (e) {
            steps.push(`관리자 계정 생성 실패: ${e.message}`);
            res.json({
                success: false,
                message: '관리자 계정 생성 중 오류 발생',
                steps: steps,
                error: e.message
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '테이블 수정 중 오류 발생',
            error: error.message
        });
    }
});

// 404 핸들러 (모든 라우트 정의 후)
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