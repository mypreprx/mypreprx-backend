// import dns from 'node:dns';
// dns.setServers(['8.8.8.8', '1.1.1.1']);


import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http'; // <--- NEW: Import HTTP module
import { Server } from 'socket.io'; // <--- NEW: Import Socket.io

import userRoutes from './Routes/userRoutes.js';
import connectDB from './Config/connectionDB.js'
import adminRoutes from './Routes/adminRoutes.js';
import billingRoutes from './Routes/billingRoutes.js';
import { stripeWebhookHandler } from './Controllers/billingController.js';
import cookieParser from 'cookie-parser';
import cors from 'cors'
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
connectDB();

const app = express();
const Port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP SOCKET.IO SERVER
// ==========================================
const server = http.createServer(app); // Wrap Express app in HTTP server
server.timeout = 600000; // 10 minutes timeout for large file uploads
server.headersTimeout = 605000;
server.keepAliveTimeout = 600000;

const io = new Server(server, {
    cors: {
        // Must match your Express CORS settings exactly
        origin: [
            "https://mypreprx.com",
            "https://www.mypreprx.com",
            "https://api.mypreprx.com",
            'http://localhost:5173',
            'http://localhost:5174'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
});

// Store 'io' in Express so we can use it in Controllers via req.app.get('io')
app.set('io', io);

// Socket.io Connection Logic
// Join authenticated users to personal rooms for targeted notifications (e.g. billing)
const parseCookieToken = (cookieHeader) => {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)Token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    try {
        const token = socket.handshake.auth?.token || parseCookieToken(socket.handshake.headers.cookie);
        if (token && process.env.JWT_SECRET) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded?.id) {
                socket.join(`user_${decoded.id}`);
            }
        }
    } catch {
        // Unauthenticated socket — still allowed for existing public/study-buddy usage
    }

    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);
    });
});

// ==========================================
// 2. MIDDLEWARE
// ==========================================
app.use(cookieParser());

// Stripe webhook MUST receive the raw body for signature verification.
// Mounted before express.json so the body is not parsed as JSON.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, './uploads')));
app.use(
    cors({
        origin: [
            "https://mypreprx.com",
            "https://www.mypreprx.com",
            "https://api.mypreprx.com",
            'http://localhost:5173',
            'http://localhost:5174'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// ==========================================
// 3. ROUTES
// ==========================================
app.use('/api', userRoutes);
app.use('/api', adminRoutes);
app.use('/api', billingRoutes);
// Stripe webhook (raw body via middleware above) — source of truth for subscription state
app.post('/api/stripe/webhook', stripeWebhookHandler);

// Global & Multer Error Handling Middleware
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File size limit exceeded. Maximum allowed file size is 200 MB.'
        });
    }
    if (err.name === 'MulterError') {
        return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`
        });
    }
    if (err) {
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || 'An unexpected error occurred'
        });
    }
    next();
});

// ==========================================
// 4. START SERVER (Change app.listen -> server.listen)
// ==========================================
server.listen(Port, () => {
    console.log(`Server is Live at ${Port}`);
});