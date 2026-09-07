import jwt from 'jsonwebtoken';
import userModel from '../../Models/userSchema.js';
import adminModel from '../../Models/adminSchema.js';

const VerifyUser = async (req, res, next) => {
    try {
        let token;

        // PRIORITY 1: Check Cookies (Best for Web/Secure HttpOnly)
        if (req.cookies && req.cookies.Token) {
            token = req.cookies.Token;
        }
        // PRIORITY 2: Check Authorization Header (Best for Mobile/Postman)
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ message: "Access denied. No token provided." });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify multiple session invalidation
        let user;
        if (decoded.role === 'admin') {
            user = await adminModel.findById(decoded.adminId || decoded.id);
        } else {
            user = await userModel.findById(decoded.id);
        }

        if (!user || user.sessionToken !== token) {
             res.clearCookie('Token');
             return res.status(401).json({ 
                 message: "Session invalidated. You have logged in from another device.",
                 code: "SESSION_INVALIDATED"
             });
        }
        
        // Attach the decoded user payload to the request object
        req.user = decoded; 
        
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
             return res.status(401).json({ message: "Token has expired. Please login again." });
        }
        return res.status(401).json({ message: "Invalid Token" });
    }
};

const allowRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // Ensure req.user exists before checking role to prevent crashes
        // console.log(req.user);
        
        if (!req.user || !req.user.role) {
             return res.status(403).json({ message: "Access forbidden: User role undefined" });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`
            });
        }
        next();
    };
};

export { VerifyUser, allowRoles };