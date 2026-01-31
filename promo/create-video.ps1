# 예겜 홍보 영상 생성 스크립트
# 15초 세로형 (9:16) 숏츠/릴스용

$outputDir = "C:\Users\yoon4\clawd\projects\yegam\promo"
$snowImg = "C:\Users\yoon4\clawd\projects\yegam\snow-city.jpg"

# 출력 디렉토리 생성
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# 폰트 경로 (Windows 기본 한글 폰트)
$fontPath = "C\\:/Windows/Fonts/malgun.ttf"

# 1080x1920 세로 영상 생성 (숏츠/릴스 비율)
# 배경 이미지 + 텍스트 오버레이 + 페이드 효과

$ffmpegCmd = @"
ffmpeg -y -loop 1 -i "$snowImg" -f lavfi -i "color=c=black:s=1080x1920:d=15" -filter_complex "
[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];
[bg]drawtext=fontfile='$fontPath':text='❄️ 설날':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=h/3:enable='between(t,0,5)',
drawtext=fontfile='$fontPath':text='서울에 눈이 올까?':fontsize=70:fontcolor=white:x=(w-text_w)/2:y=h/3+120:enable='between(t,0.5,5)',
drawtext=fontfile='$fontPath':text='🎰 예측하고':fontsize=70:fontcolor=yellow:x=(w-text_w)/2:y=h/3:enable='between(t,5,10)',
drawtext=fontfile='$fontPath':text='GAM 벌자!':fontsize=80:fontcolor=yellow:x=(w-text_w)/2:y=h/3+100:enable='between(t,5.5,10)',
drawtext=fontfile='$fontPath':text='✅ YES    ❌ NO':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=h/2+100:enable='between(t,6,10)',
drawtext=fontfile='$fontPath':text='👉 yegam.ai.kr':fontsize=90:fontcolor=cyan:x=(w-text_w)/2:y=h/2-50:enable='between(t,10,15)',
drawtext=fontfile='$fontPath':text='지금 바로 접속!':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=h/2+80:enable='between(t,11,15)',
fade=t=in:st=0:d=0.5,fade=t=out:st=14.5:d=0.5[v]" -map "[v]" -t 15 -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "$outputDir\yegam-promo-snow.mp4"
"@

Write-Host "🎬 영상 생성 중..." -ForegroundColor Cyan
Invoke-Expression $ffmpegCmd

if (Test-Path "$outputDir\yegam-promo-snow.mp4") {
    Write-Host "✅ 영상 생성 완료!" -ForegroundColor Green
    Write-Host "   📁 $outputDir\yegam-promo-snow.mp4"
} else {
    Write-Host "❌ 영상 생성 실패" -ForegroundColor Red
}
