/**
 * 예겜 Admin API Client
 * 로그인, 이슈 CRUD, 이미지 업로드 등
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    baseUrl: process.env.YEGAM_API_URL || 'https://yegam-production.up.railway.app',
    username: process.env.YEGAM_ADMIN_USER || 'superadmin',
    password: process.env.YEGAM_ADMIN_PASS || 'TempAdmin2025!'
};

let cachedToken = null;
let tokenExpiry = null;

/**
 * HTTP 요청 헬퍼
 */
function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = protocol.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject({ status: res.statusCode, ...json });
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    if (res.statusCode >= 400) {
                        reject({ status: res.statusCode, message: data });
                    } else {
                        resolve(data);
                    }
                }
            });
        });
        
        req.on('error', reject);
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

/**
 * 관리자 로그인 & 토큰 획득
 */
async function login() {
    // 캐시된 토큰이 유효하면 재사용
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }
    
    const result = await request(`${CONFIG.baseUrl}/api/admin-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });
    
    if (!result.success || !result.token) {
        throw new Error(result.message || '로그인 실패');
    }
    
    cachedToken = result.token;
    tokenExpiry = Date.now() + 7 * 60 * 60 * 1000; // 7시간 (8시간 만료 전)
    
    return cachedToken;
}

/**
 * 인증된 API 요청
 */
async function authRequest(endpoint, options = {}) {
    const token = await login();
    
    return request(`${CONFIG.baseUrl}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });
}

/**
 * 이슈 생성
 */
async function createIssue(issue) {
    const endDate = issue.endDate || issue.end_date;
    const bettingEndDate = issue.bettingEndDate || issue.betting_end_date || endDate;
    
    return authRequest('/api/admin/issues', {
        method: 'POST',
        body: JSON.stringify({
            title: issue.title,
            description: issue.description || '',
            category: issue.category,
            endDate: endDate,
            bettingEndDate: bettingEndDate,
            is_popular: issue.popular || issue.is_popular || false,
            image_url: issue.imageUrl || issue.image_url || null
        })
    });
}

/**
 * 이슈 수정
 */
async function updateIssue(id, issue) {
    return authRequest(`/api/admin/issues/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            title: issue.title,
            description: issue.description || '',
            category: issue.category,
            end_date: issue.endDate || issue.end_date,
            is_popular: issue.popular || issue.is_popular || false,
            image_url: issue.imageUrl || issue.image_url || null
        })
    });
}

/**
 * 이슈 삭제
 */
async function deleteIssue(id) {
    return authRequest(`/api/admin/issues/${id}`, {
        method: 'DELETE'
    });
}

/**
 * 이슈 목록 조회
 */
async function listIssues() {
    return authRequest('/api/admin/issues');
}

/**
 * 이미지 업로드 (multipart/form-data)
 */
async function uploadImage(filePath) {
    const token = await login();
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    
    const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n`,
        `Content-Type: image/${path.extname(filePath).slice(1) || 'png'}\r\n\r\n`
    ];
    
    const bodyStart = Buffer.from(bodyParts.join(''), 'utf-8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);
    
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(`${CONFIG.baseUrl}/api/admin/upload`);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = protocol.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(new Error(data));
                }
            });
        });
        
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * URL에서 이미지 다운로드
 */
async function downloadImage(url, outputPath) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const file = fs.createWriteStream(outputPath);
        
        protocol.get(url, (response) => {
            // 리다이렉트 처리
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadImage(response.headers.location, outputPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(outputPath);
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => {});
            reject(err);
        });
    });
}

/**
 * GitHub에 이미지 저장 & URL 반환
 * @param {string} imagePath - 로컬 이미지 파일 경로
 * @param {string} filename - 저장할 파일명 (예: issue-113.jpg)
 * @returns {Promise<{success: boolean, url: string}>}
 */
async function saveImageToGitHub(imagePath, filename) {
    const { execSync } = require('child_process');
    const repoRoot = path.resolve(__dirname, '../..');
    const imagesDir = path.join(repoRoot, 'public', 'images', 'issues');
    
    // 이미지 폴더 확인/생성
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // 파일 복사
    const destPath = path.join(imagesDir, filename);
    fs.copyFileSync(imagePath, destPath);
    
    // Git commit & push
    try {
        const relativePath = path.relative(repoRoot, destPath).replace(/\\/g, '/');
        execSync(`git add "${relativePath}"`, { cwd: repoRoot, stdio: 'pipe' });
        execSync(`git commit -m "Add image: ${filename}"`, { cwd: repoRoot, stdio: 'pipe' });
        execSync('git push', { cwd: repoRoot, stdio: 'pipe' });
        
        // GitHub raw URL 생성
        const url = `https://raw.githubusercontent.com/ddoriboo/yegam/main/public/images/issues/${filename}`;
        
        return { success: true, url };
    } catch (error) {
        // commit 실패해도 로컬에는 파일 있음
        console.error('Git 작업 실패:', error.message);
        return { 
            success: false, 
            url: null,
            localPath: destPath,
            error: error.message 
        };
    }
}

module.exports = {
    CONFIG,
    login,
    authRequest,
    createIssue,
    updateIssue,
    deleteIssue,
    listIssues,
    uploadImage,
    downloadImage,
    saveImageToGitHub
};
