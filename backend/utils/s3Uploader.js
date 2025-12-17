const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// Configure AWS S3
const s3Config = {
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
    },
};

if (process.env.S3_ENDPOINT) {
    const endpoint = process.env.S3_ENDPOINT;
    s3Config.endpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
    s3Config.forcePathStyle = true;
}

const s3 = new S3Client(s3Config);

/**
 * Uploads an image buffer to S3 bucket.
 * @param {Buffer} fileBuffer 
 * @param {string} mimeType 
 * @param {string} folder 
 * @returns {Promise<string>} Public URL of the uploaded file
 */
exports.uploadImage = async (fileBuffer, mimeType, folder) => {
    // 1. Validate File Type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
        throw new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }

    // 2. Validate Size (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
        throw new Error('File size exceeds 5MB limit.');
    }

    // 3. Generate Unique Filename
    const extension = mimeType.split('/')[1];
    const filename = `${folder}/${crypto.randomUUID()}.${extension}`;

    // 4. Upload to S3
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: filename,
        Body: fileBuffer,
        ContentType: mimeType,
    };

    await s3.send(new PutObjectCommand(params));

    // Construct public URL
    if (process.env.S3_ENDPOINT) {
        const endpoint = process.env.S3_ENDPOINT.replace(/\/$/, '');
        const finalEndpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
        return `${finalEndpoint}/${process.env.S3_BUCKET}/${filename}`;
    }

    return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${filename}`;
};
