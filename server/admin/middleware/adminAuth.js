const jwt = require('jsonwebtoken');
const AdminAuth = require('../models/AdminAuth');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const { isAdminRole } = require('../../utils/roles');

/**
 * Middleware to verify admin authentication (dual auth)
 * Requires both user auth and admin auth tokens
 */
const requireAdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminAuthHeader = req.headers['x-admin-token'];

    // Check for admin token
    if (!adminAuthHeader) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    // Also check for user token
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const userToken = authHeader.split(' ')[1];
    const adminToken = adminAuthHeader;

    // Verify user token first
    let userDecoded;
    try {
      userDecoded = jwt.verify(userToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user token'
      });
    }

    // Verify admin token
    let adminDecoded;
    try {
      adminDecoded = jwt.verify(adminToken, process.env.JWT_SECRET);
      
      if (adminDecoded.type !== 'admin') {
        throw new Error('Invalid admin token type');
      }
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired admin token'
      });
    }

    // Ensure user and admin tokens match the same user
    if (userDecoded.userId !== adminDecoded.userId) {
      logger.warn('Mismatched user and admin tokens', {
        userTokenUserId: userDecoded.userId,
        adminTokenUserId: adminDecoded.userId,
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        message: 'Authentication mismatch'
      });
    }

    // Verify user exists and has admin role
    const user = await User.findById(userDecoded.userId);
    if (!user || !isAdminRole(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin role required'
      });
    }

    // Verify admin auth record exists and is active
    const adminAuth = await AdminAuth.findById(adminDecoded.adminId);
    if (!adminAuth || !adminAuth.isActive || adminAuth.userId.toString() !== userDecoded.userId) {
      return res.status(403).json({
        success: false,
        message: 'Admin access revoked or invalid'
      });
    }

    // Attach user and admin info to request
    req.user = {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    req.admin = {
      adminId: adminAuth._id,
      adminUsername: adminAuth.adminUsername,
      userId: adminAuth.userId
    };

    next();

  } catch (error) {
    logger.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware to check if user has admin role (for accessing admin login page)
 */
const requireUserAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findById(decoded.userId);
      if (!user || !isAdminRole(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin role required'
        });
      }

      req.user = {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      };

      next();

    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

  } catch (error) {
    logger.error('User admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware to log admin actions
 */
const logAdminAction = (action) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action after response is sent
      setImmediate(() => {
        logger.info(`Admin action: ${action}`, {
          adminId: req.admin?.adminId,
          adminUsername: req.admin?.adminUsername,
          userId: req.user?.userId,
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          statusCode: res.statusCode,
          timestamp: new Date().toISOString()
        });
      });
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  requireAdminAuth,
  requireUserAdmin,
  logAdminAction
};
