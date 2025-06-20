const bcrypt = require('bcryptjs');
const { query, initDatabase } = require('../database/database');

async function createDefaultAdmin() {
    // 데이터베이스 초기화
    console.log('Initializing database connection...');
    await initDatabase();
    const defaultPassword = 'TempAdmin2025!';
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);
    
    console.log('Creating default admin account...');
    console.log('Username: superadmin');
    console.log('Email: admin@yegam.com');
    console.log('Password:', defaultPassword);
    console.log('⚠️ IMPORTANT: Change this password immediately after first login!');
    
    try {
        // Admin 테이블 생성
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

        // Admin 활동 로그 테이블
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

        // Admin 세션 테이블
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

        // 기본 관리자 계정 생성
        const result = await query(`
            INSERT INTO admins (username, email, password_hash, full_name, role) 
            VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (username) DO UPDATE SET 
                password_hash = EXCLUDED.password_hash,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, ['superadmin', 'admin@yegam.com', hashedPassword, '시스템 관리자', 'super_admin']);
        
        console.log('✅ Admin tables and default account created successfully!');
        console.log('Admin ID:', result.rows[0].id);
        
    } catch (error) {
        console.error('❌ Error creating admin account:', error);
        throw error;
    }
}

if (require.main === module) {
    createDefaultAdmin().then(() => {
        console.log('Admin setup completed.');
        process.exit(0);
    }).catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

module.exports = { createDefaultAdmin };