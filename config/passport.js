const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { getDB } = require('../database/init');

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id, done) => {
    const db = getDB();
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        done(err, user);
    });
});

// Google OAuth Strategy (only if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
    try {
        const db = getDB();
        
        // Check if user already exists
        db.get('SELECT * FROM users WHERE provider_id = ? AND provider = ?', 
            [profile.id, 'google'], (err, existingUser) => {
            
            if (err) return done(err);
            
            if (existingUser) {
                return done(null, existingUser);
            }
            
            // Create new user
            const newUser = {
                username: profile.displayName || profile.emails[0].value.split('@')[0],
                email: profile.emails[0].value,
                provider: 'google',
                provider_id: profile.id,
                profile_image: profile.photos[0]?.value,
                verified: true
            };
            
            db.run(`INSERT INTO users (username, email, provider, provider_id, profile_image, verified) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                [newUser.username, newUser.email, newUser.provider, newUser.provider_id, 
                 newUser.profile_image, newUser.verified],
                function(err) {
                    if (err) return done(err);
                    
                    newUser.id = this.lastID;
                    newUser.coins = 10000;
                    return done(null, newUser);
                }
            );
        });
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
        const db = getDB();
        
        // Check if user already exists
        db.get('SELECT * FROM users WHERE provider_id = ? AND provider = ?', 
            [profile.id, 'github'], (err, existingUser) => {
            
            if (err) return done(err);
            
            if (existingUser) {
                return done(null, existingUser);
            }
            
            // Create new user
            const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
            const newUser = {
                username: profile.username || profile.displayName,
                email: email,
                provider: 'github',
                provider_id: profile.id,
                profile_image: profile.photos[0]?.value,
                verified: true
            };
            
            db.run(`INSERT INTO users (username, email, provider, provider_id, profile_image, verified) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                [newUser.username, newUser.email, newUser.provider, newUser.provider_id, 
                 newUser.profile_image, newUser.verified],
                function(err) {
                    if (err) return done(err);
                    
                    newUser.id = this.lastID;
                    newUser.coins = 10000;
                    return done(null, newUser);
                }
            );
        });
    } catch (error) {
        return done(error);
    }
    }));
}

module.exports = passport;