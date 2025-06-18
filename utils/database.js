const { getDB } = require('../database/init');

const executeQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
};

const fetchOne = (query, params = []) => {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

const fetchAll = (query, params = []) => {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

const findUserByEmail = (email) => {
    return fetchOne('SELECT * FROM users WHERE email = ?', [email]);
};

const findUserById = (id) => {
    return fetchOne('SELECT * FROM users WHERE id = ?', [id]);
};

const createUser = (userData) => {
    const { username, email, hashedPassword, verificationToken } = userData;
    return executeQuery(
        'INSERT INTO users (username, email, password_hash, verification_token) VALUES (?, ?, ?, ?)',
        [username, email, hashedPassword, verificationToken]
    );
};

const updateUser = (id, updateData) => {
    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    return executeQuery(
        `UPDATE users SET ${setClause} WHERE id = ?`,
        [...values, id]
    );
};

const findIssueById = (id) => {
    return fetchOne('SELECT * FROM issues WHERE id = ? AND status = "active"', [id]);
};

const createIssue = (issueData) => {
    const { title, category, endDate, yesPrice, isPopular } = issueData;
    return executeQuery(
        'INSERT INTO issues (title, category, end_date, yes_price, is_popular) VALUES (?, ?, ?, ?, ?)',
        [title, category, endDate, yesPrice || 50, isPopular ? 1 : 0]
    );
};

const updateIssue = (id, updateData) => {
    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    return executeQuery(
        `UPDATE issues SET ${setClause} WHERE id = ?`,
        [...values, id]
    );
};

const findBetByUserAndIssue = (userId, issueId) => {
    return fetchOne('SELECT * FROM bets WHERE user_id = ? AND issue_id = ?', [userId, issueId]);
};

const createBet = (betData) => {
    const { userId, issueId, choice, amount } = betData;
    return executeQuery(
        'INSERT INTO bets (user_id, issue_id, choice, amount) VALUES (?, ?, ?, ?)',
        [userId, issueId, choice, amount]
    );
};

const updateBet = (id, updateData) => {
    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    return executeQuery(
        `UPDATE bets SET ${setClause} WHERE id = ?`,
        [...values, id]
    );
};

module.exports = {
    executeQuery,
    fetchOne,
    fetchAll,
    findUserByEmail,
    findUserById,
    createUser,
    updateUser,
    findIssueById,
    createIssue,
    updateIssue,
    findBetByUserAndIssue,
    createBet,
    updateBet
};