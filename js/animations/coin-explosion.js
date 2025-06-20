// 코인 폭발 애니메이션 시스템
class CoinExplosion {
    constructor() {
        this.particles = [];
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.isAnimating = false;
        
        this.createCanvas();
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '9999';
        this.canvas.style.opacity = '0';
        this.canvas.id = 'coin-explosion-canvas';
        
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    explode() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.particles = [];
        this.canvas.style.opacity = '1';
        
        // 중앙에서 시작하는 코인들 생성
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // 메인 코인 폭발
        for (let i = 0; i < 30; i++) {
            this.particles.push(new CoinParticle(centerX, centerY, 'main'));
        }
        
        // 추가 작은 코인들
        for (let i = 0; i < 20; i++) {
            this.particles.push(new CoinParticle(
                centerX + (Math.random() - 0.5) * 200,
                centerY + (Math.random() - 0.5) * 200,
                'small'
            ));
        }
        
        // 컨페티 추가
        for (let i = 0; i < 15; i++) {
            this.particles.push(new ConfettiParticle(
                Math.random() * this.canvas.width,
                -20
            ));
        }
        
        this.animate();
        
        // 3초 후 정리
        setTimeout(() => {
            this.cleanup();
        }, 3000);
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 파티클 업데이트 및 그리기
        this.particles = this.particles.filter(particle => {
            particle.update();
            particle.draw(this.ctx);
            return particle.isAlive();
        });
        
        if (this.particles.length > 0 && this.isAnimating) {
            this.animationId = requestAnimationFrame(() => this.animate());
        } else {
            this.cleanup();
        }
    }
    
    cleanup() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.canvas.style.opacity = '0';
        this.particles = [];
    }
}

// 코인 파티클 클래스
class CoinParticle {
    constructor(x, y, type = 'main') {
        this.x = x;
        this.y = y;
        this.type = type;
        
        // 물리 속성
        const angle = Math.random() * Math.PI * 2;
        const speed = type === 'main' ? 8 + Math.random() * 12 : 4 + Math.random() * 8;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - (type === 'main' ? 5 : 2);
        this.gravity = 0.5;
        this.friction = 0.98;
        
        // 회전
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
        
        // 크기 및 색상
        this.size = type === 'main' ? 25 + Math.random() * 15 : 15 + Math.random() * 10;
        this.maxSize = this.size;
        this.scale = 0;
        this.alpha = 1;
        
        // 생명주기
        this.life = 1;
        this.maxLife = 60 + Math.random() * 40;
        this.age = 0;
        
        // 색상 (골든 코인)
        this.colors = ['#FFD700', '#FFA500', '#FF8C00', '#FFE55C'];
        this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
    }
    
    update() {
        this.age++;
        
        // 초기 스케일 애니메이션
        if (this.age < 10) {
            this.scale = this.age / 10;
        } else {
            this.scale = 1;
        }
        
        // 물리 업데이트
        this.vx *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        
        // 회전
        this.rotation += this.rotationSpeed;
        
        // 페이드 아웃
        if (this.age > this.maxLife * 0.7) {
            this.alpha = 1 - (this.age - this.maxLife * 0.7) / (this.maxLife * 0.3);
        }
        
        // 바운스 (바닥)
        if (this.y > window.innerHeight - 50 && this.vy > 0) {
            this.vy *= -0.6;
            this.y = window.innerHeight - 50;
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);
        
        // 코인 그리기
        const size = this.size;
        
        // 그라디언트
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.7, '#B8860B');
        gradient.addColorStop(1, '#8B4513');
        
        // 외곽 원
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        
        // 메인 코인
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.9, 0, Math.PI * 2);
        ctx.fill();
        
        // 글자 (GAM)
        ctx.fillStyle = '#8B4513';
        ctx.font = `bold ${size * 0.4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAM', 0, 0);
        
        // 하이라이트
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(-size * 0.3, -size * 0.3, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    isAlive() {
        return this.age < this.maxLife && this.alpha > 0.01;
    }
}

// 컨페티 파티클 클래스
class ConfettiParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        
        // 물리 속성
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = Math.random() * 3 + 2;
        this.gravity = 0.3;
        this.friction = 0.99;
        
        // 회전
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        
        // 모양
        this.width = 8 + Math.random() * 6;
        this.height = 12 + Math.random() * 8;
        this.color = this.getRandomColor();
        
        // 생명주기
        this.life = 1;
        this.maxLife = 80 + Math.random() * 40;
        this.age = 0;
        this.alpha = 1;
    }
    
    getRandomColor() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
            '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    update() {
        this.age++;
        
        // 물리 업데이트
        this.vx *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        
        // 회전
        this.rotation += this.rotationSpeed;
        
        // 페이드 아웃
        if (this.age > this.maxLife * 0.8) {
            this.alpha = 1 - (this.age - this.maxLife * 0.8) / (this.maxLife * 0.2);
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        ctx.restore();
    }
    
    isAlive() {
        return this.age < this.maxLife && this.y < window.innerHeight + 100;
    }
}

// 전역 인스턴스 생성
window.CoinExplosion = new CoinExplosion();