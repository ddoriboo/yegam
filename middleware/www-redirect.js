// www 서브도메인 리다이렉션 미들웨어
function wwwRedirect(req, res, next) {
    // production 환경에서만 작동
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }
    
    const host = req.get('host');
    
    // www.yegam.ai.kr -> yegam.ai.kr 리다이렉션
    if (host && host.startsWith('www.')) {
        const newHost = host.slice(4); // 'www.' 제거
        const redirectUrl = `https://${newHost}${req.originalUrl}`;
        
        console.log(`[WWW Redirect] ${host} -> ${newHost}`);
        return res.redirect(301, redirectUrl); // 301 영구 리다이렉션
    }
    
    next();
}

module.exports = wwwRedirect;