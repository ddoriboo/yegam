const dns = require('dns');
const https = require('https');

async function checkDNS() {
    console.log('🔍 DNS 및 SSL 상태 확인 중...\n');
    
    const domain = 'yegam.ai.kr';
    
    // DNS 조회
    console.log('1. DNS 레코드 확인:');
    try {
        const addresses = await new Promise((resolve, reject) => {
            dns.resolve4(domain, (err, addresses) => {
                if (err) reject(err);
                else resolve(addresses);
            });
        });
        console.log(`   ✅ A 레코드: ${addresses.join(', ')}`);
    } catch (err) {
        console.log(`   ❌ A 레코드를 찾을 수 없음`);
    }
    
    try {
        const cname = await new Promise((resolve, reject) => {
            dns.resolveCname(domain, (err, addresses) => {
                if (err) reject(err);
                else resolve(addresses);
            });
        });
        console.log(`   ✅ CNAME: ${cname.join(', ')}`);
    } catch (err) {
        console.log(`   ❌ CNAME 레코드를 찾을 수 없음`);
    }
    
    // HTTPS 연결 테스트
    console.log('\n2. HTTPS 연결 테스트:');
    const url = `https://${domain}`;
    
    https.get(url, (res) => {
        console.log(`   ✅ HTTPS 응답 코드: ${res.statusCode}`);
        console.log(`   ✅ SSL 인증서 활성화됨`);
        
        const cert = res.connection.getPeerCertificate();
        if (cert) {
            console.log(`   📜 인증서 발급자: ${cert.issuer.O || cert.issuer.CN}`);
            console.log(`   📅 유효기간: ${cert.valid_from} ~ ${cert.valid_to}`);
        }
    }).on('error', (err) => {
        console.log(`   ❌ HTTPS 연결 실패: ${err.message}`);
        console.log(`   💡 아직 SSL 인증서가 발급 중일 수 있습니다.`);
    });
    
    console.log('\n3. 권장 사항:');
    console.log('   - DNS 전파에는 최대 48시간이 걸릴 수 있습니다');
    console.log('   - Railway 대시보드에서 도메인 상태를 확인하세요');
    console.log('   - 가비아에서 DNS 설정이 올바른지 재확인하세요');
}

checkDNS();