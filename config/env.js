const validateEnvironment = () => {
    const required = [];
    const warnings = [];

    // Check for required environment variables
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key') {
        required.push('JWT_SECRET - Use a secure random string for production');
    }

    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-session-secret') {
        required.push('SESSION_SECRET - Use a secure random string for production');
    }

    // Check for optional but recommended variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        warnings.push('EMAIL_USER and EMAIL_PASS - Email verification will not work');
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        warnings.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET - Google OAuth will not work');
    }

    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
        warnings.push('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET - GitHub OAuth will not work');
    }

    if (!process.env.FRONTEND_URL) {
        warnings.push('FRONTEND_URL - Using default localhost:3000');
    }

    // Log results
    if (required.length > 0) {
        console.error('\n❌ Missing required environment variables:');
        required.forEach(msg => console.error(`  - ${msg}`));
        
        if (process.env.NODE_ENV === 'production') {
            console.error('\n🚫 Cannot start in production without required environment variables');
            process.exit(1);
        } else {
            console.warn('\n⚠️  Development mode: Using default values for missing variables');
        }
    }

    if (warnings.length > 0) {
        console.warn('\n⚠️  Optional environment variables not set:');
        warnings.forEach(msg => console.warn(`  - ${msg}`));
    }

    if (required.length === 0 && warnings.length === 0) {
        console.log('✅ All environment variables are properly configured');
    }
};

const getConfig = () => {
    return {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
        jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
        sessionSecret: process.env.SESSION_SECRET || 'your-session-secret',
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
        database: {
            path: process.env.DB_PATH || './database/yegame.db'
        },
        email: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        oauth: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET
            },
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET
            }
        }
    };
};

module.exports = {
    validateEnvironment,
    getConfig
};