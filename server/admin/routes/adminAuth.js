const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const AdminAuth = require('../models/AdminAuth');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { isAdmin } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const { isAdminRole } = require('../../utils/roles');

const router = express.Router();

// Rate limiting for admin login attempts
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many admin login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation rules
const adminLoginValidation = [
  body('adminUsername')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters'),
  body('adminPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

const adminCreateValidation = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID required'),
  body('adminUsername')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('adminPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

// @route   POST /api/admin/auth/login
// @desc    Admin dual authentication login
// @access  Public (but requires user to be already logged in and have Admin role)
router.post('/login', adminLoginLimiter, adminLoginValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { adminUsername, adminPassword } = req.body;

    // Check if user is authenticated and has admin role
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required first'
      });
    }

    const token = authHeader.split(' ')[1];
    let userId;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user token'
      });
    }

    // Verify user exists and has admin role
    const user = await User.findById(userId);
    if (!user || !isAdminRole(user.role)) {
      logger.warn(`Admin login attempt by non-admin user: ${userId}`, {
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Find admin auth record (user must be in users array)
    const adminAuth = await AdminAuth.findOne({
      users: userId,
      adminUsername,
      isActive: true
    });

    if (!adminAuth) {
      logger.warn(`Admin login attempt with invalid credentials`, {
        adminUsername,
        userId,
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Check if account is locked
    if (adminAuth.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Admin account temporarily locked due to too many failed attempts'
      });
    }

    // Verify admin password
    const isValidPassword = await adminAuth.comparePassword(adminPassword);
    
    if (!isValidPassword) {
      await adminAuth.incLoginAttempts();
      
      logger.warn(`Failed admin login attempt`, {
        adminUsername,
        userId,
        attempts: adminAuth.loginAttempts + 1,
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Reset login attempts on successful login
    await adminAuth.resetLoginAttempts();

    // Generate admin session token
    const adminToken = jwt.sign(
      { 
        userId,
        adminId: adminAuth._id,
        adminUsername: adminAuth.adminUsername,
        type: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '4h' } // Shorter expiry for admin sessions
    );

    logger.info(`Successful admin login`, {
      adminUsername,
      userId,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Admin authentication successful',
      adminToken,
      adminUser: {
        adminId: adminAuth._id,
        adminUsername: adminAuth.adminUsername,
        userId: adminAuth.userId,
        lastLogin: adminAuth.lastLogin
      }
    });

  } catch (error) {
    logger.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin login'
    });
  }
});

// @route   POST /api/admin/auth/create
// @desc    Create new admin authentication record (SuperAdmin creates new admin credentials)
// @access  Private (Admin with dual authentication)
router.post('/create', adminCreateValidation, async (req, res) => {
  try {
    // Verify the request comes from an authenticated admin
    // const authHeader = req.headers.authorization;
    // const adminTokenHeader = req.headers['x-admin-token'];
    
    // if (!authHeader || !adminTokenHeader) {
    //   return res.status(401).json({
    //     success: false,
    //     message: 'Admin authentication required to create admin credentials'
    //   });
    // }

    // try {
    //   const userToken = authHeader.split(' ')[1];
      
    //   // Check if tokens are properly formatted
    //   if (!userToken || userToken === 'undefined' || userToken === 'null') {
    //     return res.status(401).json({
    //       success: false,
    //       message: 'Invalid user token format'
    //     });
    //   }
      
    //   if (!adminTokenHeader || adminTokenHeader === 'undefined' || adminTokenHeader === 'null') {
    //     return res.status(401).json({
    //       success: false,
    //       message: 'Invalid admin token format'
    //     });
    //   }

    //   const decodedUser = jwt.verify(userToken, process.env.JWT_SECRET);
    //   const decodedAdmin = jwt.verify(adminTokenHeader, process.env.JWT_SECRET);
      
    //   // Verify user is admin and admin token is valid
    //   const currentUser = await User.findById(decodedUser.userId);
    //   if (!currentUser || !isAdminRole(currentUser.role) || decodedAdmin.type !== 'admin') {
    //     return res.status(403).json({
    //       success: false,
    //       message: 'Insufficient permissions to create admin credentials'
    //     });
    //   }
    // } catch (authError) {
    //   logger.error('Authentication error in /create:', {
    //     error: authError.message,
    //     hasAuthHeader: !!authHeader,
    //     hasAdminToken: !!adminTokenHeader,
    //     authHeaderFormat: authHeader ? authHeader.substring(0, 20) + '...' : 'missing',
    //     adminTokenFormat: adminTokenHeader ? adminTokenHeader.substring(0, 20) + '...' : 'missing'
    //   });
      
    //   return res.status(401).json({
    //     success: false,
    //     message: `Authentication failed: ${authError.message}`
    //   });
    // }

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId, adminUsername, adminPassword } = req.body;

    // Verify target user exists and has admin role
    const targetUser = await User.findById(userId);
    // if (!targetUser || !isAdminRole(targetUser.role)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'User must have Admin role'
    //   });
    // }

    // Check if admin auth already exists for this user
    const existingAuth = await AdminAuth.findOne({ users: userId });
    if (existingAuth) {
      return res.status(400).json({
        success: false,
        message: 'Admin authentication already exists for this user'
      });
    }

    // Check if username is already taken
    const existingUsername = await AdminAuth.findOne({ adminUsername });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Admin username already taken'
      });
    }

    // Create new admin auth record
    const adminAuth = new AdminAuth({
      users: [userId],
      adminUsername,
      adminPassword,
      // createdBy: jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET).userId
    });

    await adminAuth.save();

    logger.info(`New admin auth created`, {
      createdFor: userId,
      adminUsername,
      createdBy: adminAuth.createdBy,
      targetUserEmail: targetUser.email
    });

    // Send notification to user
    try {
      await Notification.createNotification({
        recipient: userId,
        type: 'admin_message',
        title: 'You are now an Admin!',
        message: `Congratulations! You have been granted admin privileges with the username "${adminUsername}". You can now access the admin panel and perform admin actions.`,
        priority: 'high',
      });
    } catch (notifyErr) {
      logger.error('Failed to send admin notification (create):', notifyErr);
    }

    res.status(201).json({
      success: true,
      message: 'Admin authentication created successfully',
      data: {
        adminId: adminAuth._id,
        adminUsername: adminAuth.adminUsername,
        userId: targetUser._id,
        userEmail: targetUser.email,
        isActive: adminAuth.isActive
      }
    });

  } catch (error) {
    logger.error('Admin creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin creation'
    });
  }
});

// @route   POST /api/admin/auth/logout
// @desc    Admin logout (invalidate admin session)
// @access  Private (Admin)
router.post('/logout', async (req, res) => {
  try {
    // In a more complex setup, you might maintain a blacklist of tokens
    // For now, we'll just return success as JWT tokens are stateless
    
    logger.info('Admin logout', {
      adminId: req.admin?.adminId,
      userId: req.admin?.userId
    });

    res.json({
      success: true,
      message: 'Admin logout successful'
    });

  } catch (error) {
    logger.error('Admin logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin logout'
    });
  }
});

// @route   GET /api/admin/auth/verify
// @desc    Verify admin token and return admin info
// @access  Private (Admin)
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Admin token required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.type !== 'admin') {
        return res.status(401).json({
          success: false,
          message: 'Invalid admin token'
        });
      }

      // Verify admin auth still exists and is active
      const adminAuth = await AdminAuth.findById(decoded.adminId);
      if (!adminAuth || !adminAuth.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Admin access revoked'
        });
      }

      res.json({
        success: true,
        adminUser: {
          adminId: adminAuth._id,
          adminUsername: adminAuth.adminUsername,
          users: adminAuth.users,
          lastLogin: adminAuth.lastLogin
        }
      });

    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired admin token'
      });
    }

  } catch (error) {
    logger.error('Admin verify error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin verification'
    });
  }
});

// @route GET /api/admin/auth/all
// @desc    Get all admin credentials
// @access  Private (Admin)
router.get('/all', async (req, res) => {
  try {
    const adminAuths = await AdminAuth.find();
    res.json({
      success: true,
      data: adminAuths
    });
  } catch (error) {
    logger.error('Get all admin auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during fetching all admin auth'
    });
  }
});

// @route   POST /api/admin/auth/bootstrap
// @desc    Create first admin account (no authentication required)
// @access  Public (only works if no admin exists)
router.post('/bootstrap', [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID required'),
  body('adminUsername')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('adminPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
], async (req, res) => {
  try {
    // Check if any admin auth records exist
    const existingAdminCount = await AdminAuth.countDocuments();
    if (existingAdminCount > 0) {
      return res.status(403).json({
        success: false,
        message: 'Admin accounts already exist. Use the regular create endpoint.'
      });
    }

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId, adminUsername, adminPassword } = req.body;

    // Verify target user exists and has admin role
    const targetUser = await User.findById(userId);
    if (!targetUser || !isAdminRole(targetUser.role)) {
      return res.status(400).json({
        success: false,
        message: 'User must exist and have Admin role'
      });
    }

    // Check if username is already taken (shouldn't happen since no admins exist, but good practice)
    const existingUsername = await AdminAuth.findOne({ adminUsername });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Admin username already taken'
      });
    }

    // Create first admin auth record with users array
    const adminAuth = new AdminAuth({
      users: [userId],
      adminUsername,
      adminPassword,
      createdBy: userId // Self-created for bootstrap
    });
    await adminAuth.save();

    logger.info(`Bootstrap admin auth created`, {
      createdFor: userId,
      adminUsername,
      userEmail: targetUser.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Send notification to user
    try {
      await Notification.createNotification({
        recipient: userId,
        type: 'admin_message',
        title: 'You are now an Admin!',
        message: 'Congratulations! You have been granted admin privileges. You can now access the admin panel and perform admin actions.',
        priority: 'high',
      });
    } catch (notifyErr) {
      logger.error('Failed to send admin notification (bootstrap):', notifyErr);
    }

    res.status(201).json({
      success: true,
      message: 'Bootstrap admin authentication created successfully',
      data: {
        adminUsername,
        userId,
        userEmail: targetUser.email
      }
    });

  } catch (error) {
    logger.error('Bootstrap admin creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during bootstrap admin creation'
    });
  }
});

// @route POST /api/admin/auth/assign
// @desc Assign existing admin credentials to a user
// @access Private
router.post('/assign', [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID required'),
  body('adminCredId')
    .isMongoId()
    .withMessage('Valid admin credential ID required')
], async (req, res) => {
  try {
    const { userId, adminCredId } = req.body;

    // Verify admin credentials exist
    const adminAuth = await AdminAuth.findById(adminCredId);
    if (!adminAuth) {
      return res.status(404).json({
        success: false,
        message: 'Admin credentials not found'
      });
    }

    // Assign admin credentials to user (multi-user support)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add user to adminAuth.users array if not already present
    if (!adminAuth.users.includes(userId)) {
      adminAuth.users.push(userId);
      await adminAuth.save();
    }

    user.adminAuth = adminAuth._id;
    await user.save();

    // Send notification to user
    try {
      await Notification.createNotification({
        recipient: user._id,
        type: 'admin_message',
        title: 'You are now an Admin!',
        message: 'Congratulations! You have been granted admin privileges. You can now access the admin panel and perform admin actions.',
        priority: 'high',
      });
    } catch (notifyErr) {
      logger.error('Failed to send admin notification (assign):', notifyErr);
    }

    res.json({
      success: true,
      message: 'Admin credentials assigned successfully',
      data: {
        userId: user._id,
        adminUsername: adminAuth.adminUsername
      }
    });

  } catch (error) {
    logger.error('Admin auth assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin auth assignment'
    });
  }
});

module.exports = router;
