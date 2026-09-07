import multer from "multer";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = '';

        // 1. Determine the subfolder based on file type
        if (file.mimetype.startsWith('video/')) {
            folder = 'videos';
        } else if (file.mimetype.startsWith('image/')) {
            folder = 'images';
        } else if (file.mimetype === 'application/pdf') {
            folder = 'docs';
        }
        // --- NEW: Add Audio Folder Logic ---
        else if (file.mimetype.startsWith('audio/')) {
            folder = 'audios';
        }
        // -----------------------------------
        else {
            folder = 'others';
        }

        // 2. Build the full path
        const uploadPath = path.join(__dirname, '../uploads', folder);

        // 3. Create folder if missing
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    // filename: (req, file, cb) => {
    //     cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`);
    // }

    // Replacing the filename function to sanitize future uploads:
    filename: (req, file, cb) => {
        // Sanitize filename: remove special characters
        const sanitizedName = file.originalname
            .replace(/[^a-zA-Z0-9.\-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        cb(null, `${Date.now()}-${sanitizedName}`);
    }

});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        // images
        "image/jpeg", "image/png", "image/webp", "image/jpg",

        // pdf
        "application/pdf",

        // videos
        "video/mp4", "video/webm", "video/mkv", "video/x-matroska",

        // --- NEW: Add Audio MIME Types ---
        "audio/mpeg",      // mp3
        "audio/mp3",       // mp3 (sometimes varies)
        "audio/wav",       // wav
        "audio/x-wav",     // wav (sometimes varies)
        "audio/aac",       // aac
        "audio/m4a",       // m4a
        "audio/x-m4a"      // m4a (sometimes varies)
        // ---------------------------------
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        // Updated Error Message
        cb(new Error("Only Image, PDF, Video, or Audio files are allowed"), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 200 * 1024 * 1024, // 200MB limit
    },
});

export default upload;