const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { query } = require('../database/postgres');

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const result = await query('SELECT * FROM users WHERE id = $1', [id]);
        const user = result.rows[0];
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Google OAuth Strategy (only if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            const existingUserResult = await query(
                'SELECT * FROM users WHERE provider_id = $1 AND provider = $2', 
                [profile.id, 'google']
            );
            
            if (existingUserResult.rows.length > 0) {
                return done(null, existingUserResult.rows[0]);
            }
            
            // Create new user
            const username = profile.displayName || profile.emails[0].value.split('@')[0];
            const email = profile.emails[0].value;
            const profileImage = profile.photos[0]?.value;
            
            const insertResult = await query(`
                INSERT INTO users (username, email, provider, provider_id, profile_image, verified, gam_balance) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [username, email, 'google', profile.id, profileImage, true, 10000]
            );
            
            const newUser = insertResult.rows[0];
            return done(null, newUser);
        } catch (error) {
            return done(error);
        }
    }));
}

// GitHub OAuth Strategy (only if credentials are provided)
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "/api/auth/github/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            const existingUserResult = await query(
                'SELECT * FROM users WHERE provider_id = $1 AND provider = $2', 
                [profile.id, 'github']
            );
            
            if (existingUserResult.rows.length > 0) {
                return done(null, existingUserResult.rows[0]);
            }
            
            // Create new user
            const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
            const username = profile.username || profile.displayName;
            const profileImage = profile.photos[0]?.value;
            
            const insertResult = await query(`
                INSERT INTO users (username, email, provider, provider_id, profile_image, verified, gam_balance) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [username, email, 'github', profile.id, profileImage, true, 10000]
            );
            
            const newUser = insertResult.rows[0];
            return done(null, newUser);
        } catch (error) {
            return done(error);
        }
    }));
}

module.exports = passport;