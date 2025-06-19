const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Cloudinary 설정
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer 메모리 저장소 설정 (Cloudinary 직접 업로드용)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // 이미지 파일만 허용
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB 제한
    }
});

// 이미지 업로드 엔드포인트 (Cloudinary)
router.post('/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: '이미지 파일이 필요합니다.' 
            });
        }

        // Cloudinary에 업로드
        const uploadOptions = {
            resource_type: 'image',
            folder: 'yegame/issues', // Cloudinary 폴더 구조
            public_id: `issue_${uuidv4()}`, // 고유한 public_id
            quality: 'auto', // 자동 품질 최적화
            fetch_format: 'auto' // 자동 포맷 최적화
        };

        // Buffer를 Base64로 변환하여 업로드
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        const result = await cloudinary.uploader.upload(dataURI, uploadOptions);

        res.json({
            success: true,
            message: '이미지 업로드 성공',
            imageUrl: result.secure_url,
            publicId: result.public_id,
            filename: result.public_id
        });

    } catch (error) {
        console.error('이미지 업로드 실패:', error);
        res.status(500).json({ 
            success: false,
            error: '이미지 업로드에 실패했습니다: ' + error.message 
        });
    }
});

// 업로드된 이미지 삭제 (Cloudinary)
router.delete('/image/:publicId', async (req, res) => {
    try {
        const { publicId } = req.params;
        
        // Cloudinary에서 이미지 삭제
        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result === 'ok') {
            res.json({
                success: true,
                message: '이미지가 삭제되었습니다.'
            });
        } else {
            res.status(404).json({ 
                success: false,
                error: '파일을 찾을 수 없습니다.' 
            });
        }

    } catch (error) {
        console.error('이미지 삭제 실패:', error);
        res.status(500).json({ 
            success: false,
            error: '이미지 삭제에 실패했습니다: ' + error.message 
        });
    }
});

module.exports = router;