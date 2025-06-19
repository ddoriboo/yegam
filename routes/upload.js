const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const router = express.Router();

// 업로드 디렉토리 확인 및 생성
const uploadDir = path.join(__dirname, '../uploads/images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

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

// 이미지 업로드 엔드포인트
router.post('/image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
        }

        // 파일 URL 생성
        const imageUrl = `/uploads/images/${req.file.filename}`;

        res.json({
            success: true,
            message: '이미지 업로드 성공',
            imageUrl: imageUrl,
            filename: req.file.filename
        });

    } catch (error) {
        console.error('이미지 업로드 실패:', error);
        res.status(500).json({ error: '이미지 업로드에 실패했습니다.' });
    }
});

// 업로드된 이미지 삭제
router.delete('/image/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({
                success: true,
                message: '이미지가 삭제되었습니다.'
            });
        } else {
            res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
        }

    } catch (error) {
        console.error('이미지 삭제 실패:', error);
        res.status(500).json({ error: '이미지 삭제에 실패했습니다.' });
    }
});

module.exports = router;