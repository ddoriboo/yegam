require('dotenv').config();

console.log('🔍 OAuth 설정 확인\n');

console.log('📋 환경 변수:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ 설정됨' : '❌ 미설정'}`);
console.log(`GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅ 설정됨' : '❌ 미설정'}`);

console.log('\n📋 예상 콜백 URL:');
const callbackURL = process.env.NODE_ENV === 'production' 
    ? "https://yegam.ai.kr/api/auth/google/callback"
    : "http://localhost:3000/api/auth/google/callback";
    
console.log(`콜백 URL: ${callbackURL}`);

console.log('\n📋 Google Cloud Console에서 확인할 사항:');
console.log('1. OAuth 클라이언트 ID의 승인된 리디렉션 URI에 다음이 포함되어야 함:');
console.log('   - https://yegam.ai.kr/api/auth/google/callback');
console.log('   - http://localhost:3000/api/auth/google/callback');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log('\n❌ 구글 OAuth 환경변수가 설정되지 않았습니다!');
    console.log('Railway에서 다음 환경변수를 설정하세요:');
    console.log('GOOGLE_CLIENT_ID=구글에서_발급받은_클라이언트_ID');
    console.log('GOOGLE_CLIENT_SECRET=구글에서_발급받은_클라이언트_시크릿');
}