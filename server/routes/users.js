const express = require('express');
const { body, param } = require('express-validator');
const User = require('../models/User');
const { ADMIN_ROLES, ASSIGNABLE_ROLES, isAdminRole, isSuperAdminRole } = require('../utils/roles');
const Experience = require('../models/Experience');
const Notification = require('../models/Notification');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');
const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    // console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile',
  isAuthenticated,
  [
    body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('university').optional().trim(),
    body('graduationYear').optional().isInt({ min: 2020, max: 2030 }).withMessage('Invalid graduation year'),
    body('preferences.notifications.email').optional().isBoolean(),
    body('preferences.notifications.browser').optional().isBoolean(),
    body('preferences.privacy.showEmail').optional().isBoolean(),
    body('preferences.privacy.showUniversity').optional().isBoolean(),
    body('backgroundData').optional().isObject()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const allowedUpdates = [
        'name', 
        'university', 
        'graduationYear', 
        'preferences',
        'backgroundData'
      ];
      
      const updates = {};
      Object.keys(req.body).forEach(key => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      updates.lastActive = new Date();

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { new: true, runValidators: true }
      ).select('-__v');

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user
      });
    } catch (error) {
      // console.error('Error updating profile:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  }
);

// @route   GET /api/users/bookmarks
// @desc    Get user bookmarks
// @access  Private
router.get('/bookmarks', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'bookmarks',
        populate: {
          path: 'userId',
          select: 'name avatar'
        }
      });

    res.json({
      success: true,
      data: user.bookmarks
    });
  } catch (error) {
    // console.error('Error fetching bookmarks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookmarks',
      error: error.message
    });
  }
});

// @route   GET /api/users/my-experiences
// @desc    Get current user's experiences
// @access  Private
router.get('/my-experiences', isAuthenticated, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const filter = { userId: req.user._id };
    if (status) {
      filter.finalResult = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [experiences, total] = await Promise.all([
      Experience.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Experience.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: experiences,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalDocuments: total,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    // console.error('Error fetching user experiences:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching experiences',
      error: error.message
    });
  }
});

// @route   GET /api/users/leaderboard
// @desc    Get user leaderboard
// @access  Public
router.get('/leaderboard', async (req, res) => {
  try {
    const { timeframe = 'all' } = req.query;
    
    let dateFilter = {};
    if (timeframe === 'month') {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      dateFilter.createdAt = { $gte: lastMonth };
    } else if (timeframe === 'week') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter.createdAt = { $gte: lastWeek };
    }

    const leaderboard = await Experience.aggregate([
      { $match: { isPublished: true, ...dateFilter } },
      {
        $group: {
          _id: '$userId',
          experienceCount: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalUpvotes: { $sum: { $size: '$upvotes' } },
          averageRating: { $avg: '$overallRating' }
        }
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ['$experienceCount', 10] },
              { $multiply: ['$totalUpvotes', 5] },
              { $multiply: ['$totalViews', 0.1] }
            ]
          }
        }
      },
      { $sort: { score: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          avatar: '$user.avatar',
          university: '$user.university',
          level: '$user.level',
          badges: '$user.badges',
          experienceCount: 1,
          totalViews: 1,
          totalUpvotes: 1,
          averageRating: { $round: ['$averageRating', 2] },
          score: { $round: ['$score', 0] }
        }
      }
    ]);

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    // console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching leaderboard',
      error: error.message
    });
  }
});

// @route   GET /api/users/:id/public-profile
// @desc    Get user public profile
// @access  Public
router.get('/:id/public-profile',
  [
    param('id').isMongoId().withMessage('Invalid user ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id)
        .select('name avatar university graduationYear backgroundData level badges stats joinedAt preferences.privacy');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user's public experiences
      const experiences = await Experience.find({
        userId: req.params.id,
        isPublished: true
      })
      .select('companyInfo.companyName companyInfo.companyLogo companyInfo.role overallRating finalResult createdAt views')
      .sort({ createdAt: -1 })
      .limit(10);

      // Calculate public stats
      const totalExperiences = experiences.length;
      const totalViews = experiences.reduce((sum, exp) => sum + exp.views, 0);
      const averageRating = totalExperiences > 0 ? 
        experiences.reduce((sum, exp) => sum + exp.overallRating, 0) / totalExperiences : 0;

      const publicProfile = {
        name: user.name,
        avatar: user.avatar,
        email: user.preferences?.privacy?.showEmail === true ? user.email : null,
        university: user.preferences?.privacy?.showUniversity !== false ? user.university : null,
        graduationYear: user.graduationYear,
        level: user.level,
        badges: user.badges,
        joinedAt: user.joinedAt,
        stats: {
          totalExperiences,
          totalViews,
          averageRating: parseFloat(averageRating.toFixed(2))
        },
        backgroundData: user.backgroundData || null,
        recentExperiences: experiences
      };

      // console.log(user);

      res.json({
        success: true,
        data: publicProfile
      });
    } catch (error) {
      // console.error('Error fetching public profile:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching profile',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account', isAuthenticated, async (req, res) => {
  try {
    // Delete user's experiences
    await Experience.deleteMany({ userId: req.user._id });

    // Delete the user
    await User.findByIdAndDelete(req.user._id);

    // Destroy session
    req.logout((err) => {
      if (err) {
        // console.error('Error during logout:', err);
      }
      req.session.destroy((err) => {
        if (err) {
          // console.error('Error destroying session:', err);
        }
        res.clearCookie('connect.sid');
        res.json({
          success: true,
          message: 'Account deleted successfully'
        });
      });
    });
  } catch (error) {
    // console.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting account',
      error: error.message
    });
  }
});

// Admin routes

// @route   GET /api/users/admin/all
// @desc    Get all users (Admin only)
// @access  Admin
router.get('/admin/all', isAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      role,
      branch,
      department,
      graduationYear,
      yearOfStudy
    } = req.query;

    const filter = {};
    
    // Search in name, email, and university
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { university: new RegExp(search, 'i') }
      ];
    }
    
    // Role filter
    if (role) {
      filter.role = role;
    }
    
    // Graduation year filter
    if (graduationYear) {
      if (Array.isArray(graduationYear)) {
        filter.graduationYear = { $in: graduationYear.map(year => parseInt(year)) };
      } else {
        filter.graduationYear = parseInt(graduationYear);
      }
    }
    
    // Background data filters
    if (branch) {
      if (Array.isArray(branch)) {
        filter['backgroundData.branch'] = { $in: branch };
      } else {
        filter['backgroundData.branch'] = branch;
      }
    }
    
    if (department) {
      if (Array.isArray(department)) {
        filter['backgroundData.department'] = { $in: department };
      } else {
        filter['backgroundData.department'] = department;
      }
    }
    
    if (yearOfStudy) {
      if (Array.isArray(yearOfStudy)) {
        filter['backgroundData.yearOfStudy'] = { $in: yearOfStudy };
      } else {
        filter['backgroundData.yearOfStudy'] = yearOfStudy;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalDocuments: total,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    // console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// @route   GET /api/users/admin/filter-options
// @desc    Get filter options for admin panel (Admin only)
// @access  Admin
router.get('/admin/filter-options', isAdmin, async (req, res) => {
  try {
    // Get enum values from User schema
    const branchOptions = [
      "B. E.",
      "B. Tech.",
      "B. Sc.",
      "Other"
    ];
    
    const departmentOptions = [
      "Automobile Engineering",
      "Biomedical Engineering",
      "Civil Engineering",
      "Computer Science and Engineering",
      "Computer Science and Engineering (AI and ML)",
      "Electrical and Electronics Engineering",
      "Electronics and Communication Engineering",
      "Instrumentation and Control Engineering",
      "Mechanical Engineering",
      "Metallurgical Engineering",
      "Production Engineering",
      "Robotics and Automation",
      "Bio Technology",
      "Fashion Technology",
      "Information Technology",
      "Textile Technology",
      "Electrical and Electronics Engineering (Sandwich)",
      "Mechanical Engineering (Sandwich)",
      "Production Engineering (Sandwich)",
      "Applied Science",
      "Computer Systems and Design"
    ];
    
    const yearOfStudyOptions = [
      '1st Year',
      '2nd Year', 
      '3rd Year',
      '4th Year',
      'Graduate',
      'Postgraduate'
    ];
    
    // Get available graduation years (dynamic from database)
    const graduationYears = await User.distinct('graduationYear');
    const validGradYears = graduationYears
      .filter(year => year && year >= 2020 && year <= 2030)
      .sort((a, b) => b - a); // Sort descending (newest first)
    
    // Get roles
    const roleOptions = ['Student', 'Admin', 'Moderator', 'SuperAdmin'];

    res.json({
      success: true,
      data: {
        branches: branchOptions,
        departments: departmentOptions,
        yearsOfStudy: yearOfStudyOptions,
        graduationYears: validGradYears,
        roles: roleOptions
      }
    });
  } catch (error) {
    // console.error('Error fetching filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
});

// @route   PUT /api/users/admin/:id/role
// @desc    Update user role (Admin only)
// @access  Admin
router.put('/admin/:id/role',
  isAdmin,
  [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('role').isIn(ASSIGNABLE_ROLES).withMessage('Invalid role')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { role } = req.body;

      const targetUser = await User.findById(req.params.id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (isSuperAdminRole(targetUser.role) && role !== targetUser.role) {
        return res.status(400).json({
          success: false,
          message: 'SuperAdmin role cannot be changed from the admin panel'
        });
      }

      if (req.user._id.toString() === req.params.id && !isAdminRole(role)) {
        return res.status(400).json({
          success: false,
          message: 'You cannot remove your own admin privileges'
        });
      }
      
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true, runValidators: true }
      ).select('-__v');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User role updated successfully',
        data: user
      });
    } catch (error) {
      // console.error('Error updating user role:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating user role',
        error: error.message
      });
    }
  }
);

// @route   GET /api/users/notifications
// @desc    Get current user's notifications
// @access  Private
router.get('/notifications', isAuthenticated, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true') {
      filter.read = false;
    }

    const notifications = await Notification.find(filter)
      .populate('relatedExperience', 'title companyInfo')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ 
      recipient: req.user._id, 
      read: false 
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
});

// @route   PUT /api/users/notifications/:notificationId/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:notificationId/read', isAuthenticated, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: req.user._id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
});

// @route   PUT /api/users/notifications/mark-all-read
// @desc    Mark all notifications as read for current user
// @access  Private
router.put('/notifications/mark-all-read', isAuthenticated, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read'
    });
  }
});


// @route   DELETE /api/users/notifications/clear-all
// @desc    Clear all notifications for current user
// @access  Private
router.delete('/notifications/clear-all', isAuthenticated, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id
    });

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} notifications`
    });
  } catch (error) {
    console.error('Error clearing all notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing notifications'
    });
  }
});

// @route   DELETE /api/users/notifications/:notificationId
// @desc    Delete a specific notification
// @access  Private
router.delete('/notifications/:notificationId', isAuthenticated, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: req.user._id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification'
    });
  }
});

// @route   POST /api/users/request-company-creation
// @desc    Request admin to create a new company
// @access  Private
router.post('/request-company-creation',
  isAuthenticated,
  [
    body('companyName').trim().isLength({ min: 2 }).withMessage('Company name must be at least 2 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { companyName } = req.body;
      const userId = req.user._id;

      // Check if there's already a pending request for this company from this user
      const existingRequest = await Notification.findOne({
        type: 'company_creation_request',
        'metadata.companyName': companyName,
        'metadata.requestedBy': userId,
        $or: [
          { 'metadata.status': 'pending' },
          { 'metadata.status': { $exists: false } }
        ]
      });

      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: 'You already have a pending request for this company'
        });
      }

      // Generate a unique identifier for this request
      const requestIdentifier = `${userId}-${companyName}-${Date.now()}`;

      // Get all admin users
      const adminUsers = await User.find({ role: { $in: ADMIN_ROLES } }).select('_id');
      
      if (adminUsers.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'No admin users found to process your request'
        });
      }

      // Create notification for all admins with the same requestIdentifier
      const notifications = [];
      for (const admin of adminUsers) {
        try {
          const notification = await Notification.createNotification({
            recipient: admin._id,
            type: 'company_creation_request',
            title: 'New Company Creation Request',
            message: `${req.user.rollNumber || req.user.name} has requested creation of company: ${companyName}`,
            priority: 'medium',
            metadata: {
              companyName: companyName,
              requestedBy: userId,
              requestedByName: req.user.name,
              requestedByEmail: req.user.email,
              requestedByRollNumber: req.user.rollNumber,
              requestIdentifier: requestIdentifier,
              status: 'pending'
            },
            actionUrl: `/admin/company-requests`
          });
          
          if (notification) {
            notifications.push(notification);
          }
        } catch (error) {
          console.error(`Error creating notification for admin ${admin._id}:`, error);
        }
      }

      if (notifications.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create company request. Please try again.'
        });
      }

      res.json({
        success: true,
        message: 'Company creation request sent to admins successfully',
        data: {
          companyName,
          requestId: notifications[0]._id,
          requestIdentifier
        }
      });

    } catch (error) {
      console.error('Error creating company request:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending company creation request'
      });
    }
  }
);

module.exports = router;
