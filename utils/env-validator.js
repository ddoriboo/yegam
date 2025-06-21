const crypto = require('crypto');

/**
 * 환경변수 검증 및 보안 강화 유틸리티
 */
class EnvironmentValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.config = {};
    }

    /**
     * 필수 환경변수 검증
     */
    validateRequired() {
        // JWT Secret 검증
        if (!process.env.JWT_SECRET) {
            if (process.env.NODE_ENV === 'production') {
                this.errors.push('JWT_SECRET는 프로덕션 환경에서 필수입니다.');
            } else {
                this.warnings.push('JWT_SECRET이 설정되지 않았습니다. 개발용 임시 키를 생성합니다.');
                this.config.jwtSecret = crypto.randomBytes(32).toString('hex');
            }
        } else {
            // JWT Secret 강도 검증
            if (process.env.JWT_SECRET.length < 32) {
                this.warnings.push('JWT_SECRET이 너무 짧습니다. 최소 32자 이상을 권장합니다.');
            }
            this.config.jwtSecret = process.env.JWT_SECRET;
        }

        // Database URL 검증
        if (!process.env.DATABASE_URL) {
            this.errors.push('DATABASE_URL이 필요합니다.');
        } else {
            this.config.databaseUrl = process.env.DATABASE_URL;
        }

        // Cloudinary 설정 검증
        if (!process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_CLOUD_NAME) {
            this.warnings.push('Cloudinary 설정이 없습니다. 이미지 업로드가 작동하지 않을 수 있습니다.');
        }

        return this;
    }

    /**
     * 보안 관련 환경변수 검증
     */
    validateSecurity() {
        // CORS 설정
        if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
            this.warnings.push('CORS_ORIGIN이 설정되지 않았습니다. 모든 도메인에서 접근 가능합니다.');
        }

        // Session Secret 검증
        if (!process.env.SESSION_SECRET) {
            this.warnings.push('SESSION_SECRET이 설정되지 않았습니다.');
            this.config.sessionSecret = crypto.randomBytes(32).toString('hex');
        } else {
            this.config.sessionSecret = process.env.SESSION_SECRET;
        }

        // 관리자 기본 비밀번호 검증
        if (process.env.ADMIN_DEFAULT_PASSWORD && process.env.ADMIN_DEFAULT_PASSWORD.length < 8) {
            this.warnings.push('ADMIN_DEFAULT_PASSWORD가 너무 짧습니다.');
        }

        return this;
    }

    /**
     * 성능 관련 환경변수 검증
     */
    validatePerformance() {
        // 포트 설정
        const port = parseInt(process.env.PORT) || 3000;
        if (port < 1024 && process.getuid && process.getuid() !== 0) {
            this.warnings.push(`포트 ${port}는 관리자 권한이 필요할 수 있습니다.`);
        }
        this.config.port = port;

        // Node 환경 설정
        this.config.nodeEnv = process.env.NODE_ENV || 'development';
        
        if (this.config.nodeEnv === 'production') {
            // 프로덕션 환경 추가 검증
            if (!process.env.JWT_SECRET) {
                this.errors.push('프로덕션 환경에서는 JWT_SECRET이 필수입니다.');
            }
        }

        return this;
    }

    /**
     * 검증 결과 출력
     */
    report() {
        console.log('\n🔍 환경변수 검증 결과:');
        
        if (this.errors.length > 0) {
            console.error('\n❌ 오류:');
            this.errors.forEach(error => console.error(`  - ${error}`));
            
            if (this.config.nodeEnv === 'production') {
                console.error('\n🚫 프로덕션 환경에서 필수 환경변수가 누락되어 서버를 시작할 수 없습니다.');
                process.exit(1);
            }
        }

        if (this.warnings.length > 0) {
            console.warn('\n⚠️ 경고:');
            this.warnings.forEach(warning => console.warn(`  - ${warning}`));
        }

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ 모든 환경변수가 올바르게 설정되었습니다.');
        }

        console.log(`\n📋 설정 요약:`);
        console.log(`  - 환경: ${this.config.nodeEnv}`);
        console.log(`  - 포트: ${this.config.port}`);
        console.log(`  - 데이터베이스: ${this.config.databaseUrl ? '설정됨' : '설정되지 않음'}`);
        console.log(`  - JWT Secret: ${this.config.jwtSecret ? '설정됨' : '설정되지 않음'}`);

        return this.config;
    }

    /**
     * 전체 검증 실행
     */
    static validate() {
        const validator = new EnvironmentValidator();
        return validator
            .validateRequired()
            .validateSecurity()
            .validatePerformance()
            .report();
    }
}

module.exports = EnvironmentValidator;