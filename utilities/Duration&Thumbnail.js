import { exec } from 'child_process';
import { getVideoDurationInSeconds } from 'get-video-duration';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static'; // <--- IMPORT THIS
import { PDFDocument } from 'pdf-lib'; // Import this
import { fromPath } from 'pdf2pic'; // <--- NEW IMPORT


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs} sec`;
    return `${mins} min${secs > 0 ? ' ' + secs + ' sec' : ''}`;
};

const generateThumbnail = (videoPath, filename) => {
    return new Promise((resolve, reject) => {
        // FIX: Pointing to your root 'uploads' folder based on your screenshot
        const outputDir = path.join(process.cwd(), 'uploads/thumbnails');
        const outputFilename = `thumb-${filename}.jpg`;
        const outputPath = path.join(outputDir, outputFilename);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // FIX: We use 'ffmpegPath' variable instead of just the word "ffmpeg"
        const command = `"${ffmpegPath}" -ss 2 -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Thumbnail Generation Error:', error);
                resolve(null);
            } else {
                // Return path relative to your server root
                resolve(`/uploads/thumbnails/${outputFilename}`);
            }
        });
    });
};

const getDuration = async (filePath) => {
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Duration extraction timed out")), 5000)
        );
        const duration = await Promise.race([
            getVideoDurationInSeconds(filePath),
            timeoutPromise
        ]);
        return duration || 0;
    } catch (error) {
        console.error("Duration Error (non-fatal):", error.message || error);
        return 0;
    }
};
const generatePdfThumbnail = async (pdfPath, filename) => {
    try {
        const outputDir = path.join(process.cwd(), 'uploads/thumbnails');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const timestamp = Date.now();
        const outputFilename = `thumb-${filename}-${timestamp}`; // No extension here, pdf2pic adds it

        // Configure options
        const options = {
            density: 100,
            saveFilename: outputFilename,
            savePath: outputDir,
            format: "png",
            width: 320,
            height: 400
        };

        const convert = fromPath(pdfPath, options);

        // Convert Page 1
        const resolve = await convert(1);

        // pdf2pic returns an object with the path, but sometimes we need to construct it
        // It usually saves as: savePath + saveFilename + .1.png
        const expectedFileName = `${outputFilename}.1.png`;

        return `/uploads/thumbnails/${expectedFileName}`;

    } catch (error) {
        console.error("PDF Thumbnail Error:", error);
        return null; // Return null so the app doesn't crash
    }
};
const deleteFile = (filePath) => {
    // 1. Safety Check: If no path provided, stop.
    console.log(filePath);

    if (!filePath) return;

    // 2. PROTECT STATIC ASSETS
    // critical: Do not delete your default PDF icon or assets folder!
    if (filePath.includes('assets') || filePath.includes('pdf-icon')) {
        return;
    }

    try {
        // 3. Clean the path
        // Remove leading slashes/backslashes so path.join works correctly from root
        // e.g. "/uploads/file.mp4" -> "uploads/file.mp4"
        const cleanPath = filePath.replace(/^[\/\\]/, '');
        console.log('The clean  Path : ', cleanPath);

        // 4. Construct the absolute path on your hard drive
        // process.cwd() gets your project root (e.g. D:\PrepRx)
        const absolutePath = path.join(process.cwd(), cleanPath);
        console.log('The absolute Path : ', absolutePath);


        // 5. Delete if exists
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            console.log(`✅ Successfully deleted: ${absolutePath}`);
        } else {
            console.warn(`⚠️ File not found (cannot delete): ${absolutePath}`);
        }
    } catch (err) {
        console.error(`❌ Error deleting file: ${filePath}`, err);
    }
};
export { formatDuration, generateThumbnail, getDuration, deleteFile, generatePdfThumbnail }