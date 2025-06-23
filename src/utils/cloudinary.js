import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadImage(buffer, options = {}) {
  try {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'ai-agents',
          ...options
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            logger.info(`Image uploaded to Cloudinary: ${result.secure_url}`);
            resolve(result);
          }
        }
      ).end(buffer);
    });
  } catch (error) {
    logger.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`Image deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    logger.error('Error deleting from Cloudinary:', error);
    throw error;
  }
}

export default cloudinary;