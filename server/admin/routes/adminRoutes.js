const express = require('express');
const router = express.Router();
const { isAdmin, isAdminWithDualAuth } = require('../../middleware/auth');
const User = require('../../models/User');
const Experience = require('../../models/Experience');
const Comment = require('../../models/Comment');
const Company = require('../../models/Company');
const Notification = require('../../models/Notification');
const AdminAuth = require('../models/AdminAuth');
const { ASSIGNABLE_ROLES, isAdminRole, isSuperAdminRole } = require('../../utils/roles');

// Include auth routes
const adminAuthRoutes = require('./adminAuth');
router.use('/auth', adminAuthRoutes);

// Admin PDF parse controller
const parsePdfController = require('../controllers/parsePdfController');
parsePdfController(router);

// @route   POST /api/admin/login
// @desc    Admin dual authentication
// @access  Admin (requires existing user session)
router.post('/login', async (req, res) => {
  try {
    // Check if user is already authenticated via Google OAuth
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'Google authentication required first'
      });
    }

    // Check if user has admin role
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin role required'
      });
    }

    const { username, password } = req.body;

    // Find admin auth record by username
    const adminAuth = await AdminAuth.findOne({ adminUsername: username });
    
    if (!adminAuth) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Check if account is locked
    if (adminAuth.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account temporarily locked due to too many failed attempts'
      });
    }

    // Check if this admin auth belongs to the current user (multi-user support)
    if (!adminAuth.users.map(id => id.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Admin credentials do not match current user'
      });
    }

    // Verify password
    const isPasswordValid = await adminAuth.comparePassword(password);
    
    if (!isPasswordValid) {
      // Increment login attempts
      await adminAuth.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Reset login attempts on successful login
    await adminAuth.resetLoginAttempts();
    
    // Store admin session
    req.session.adminAuthenticated = true;
    
    res.json({
      success: true,
      message: 'Admin authentication successful',
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
});

// @route   POST /api/admin/logout
// @desc    Admin logout (clear admin session)
// @access  Admin
router.post('/logout', (req, res) => {
  req.session.adminAuthenticated = false;
  res.json({
    success: true,
    message: 'Admin session cleared'
  });
});

// @route   GET /api/admin/auth-check
// @desc    Check if admin is authenticated (lightweight endpoint)
// @access  Admin with dual auth
router.get('/auth-check', isAdminWithDualAuth, (req, res) => {
  res.json({
    success: true,
    authenticated: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Admin with dual auth
router.get('/dashboard', isAdminWithDualAuth, async (req, res) => {
  try {
    const [
      totalUsers,
      totalExperiences,
      totalComments,
      todayUsers,
      todayExperiences,
      publishedExperiences,
      pendingExperiences,
      flaggedExperiences,
      totalCompanies
    ] = await Promise.all([
      User.countDocuments(),
      Experience.countDocuments(),
      Comment.countDocuments(),
      User.countDocuments({
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
      }),
      Experience.countDocuments({
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
      }),
      Experience.countDocuments({ isPublished: true }),
      Experience.countDocuments({ isPublished: false }),
      Experience.countDocuments({ flagged: true }),
      Company.countDocuments()
    ]);

    // // Get unique companies count
    // const companies = await Experience.distinct('company');
    // const totalCompanies = companies.length;

    // Calculate total views
    const viewsResult = await Experience.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]);
    const totalViews = viewsResult[0]?.totalViews || 0;

    // Calculate weekly growth
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const [thisWeekUsers, lastWeekUsers] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      User.countDocuments({ 
        createdAt: { 
          $gte: new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000),
          $lt: weekAgo 
        } 
      })
    ]);

    const weeklyGrowth = lastWeekUsers > 0 
      ? Math.round(((thisWeekUsers - lastWeekUsers) / lastWeekUsers) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        totalExperiences,
        totalComments,
        totalCompanies,
        totalViews,
        todayUsers,
        todayExperiences,
        publishedExperiences,
        pendingExperiences,
        flaggedExperiences,
        weeklyGrowth: `${weeklyGrowth > 0 ? '+' : ''}${weeklyGrowth}%`
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filtering
// @access  Admin
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (role && role !== '') {
      filter.role = role;
    }
    if (search && search !== '') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
      User.find(filter)
        .select('-googleId') // Don't send sensitive data
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/users/:userId/role
// @desc    Update user role
// @access  Admin
router.put('/users/:userId/role', isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role provided'
      });
    }

    const targetUser = await User.findById(userId);
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

    // Prevent admins from removing their own admin access
    if (req.user._id.toString() === userId && !isAdminRole(role)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove your own admin privileges'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, select: '-googleId' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }


    // Send notification to user about role change
    try {
      await Notification.create({
        recipient: user._id,
        type: 'admin_message',
        title: 'Your Role Has Changed',
        message: `Your role has been updated to ${role}.`,
        priority: role === 'Admin' ? 'high' : 'medium',
      });
    } catch (notifyErr) {
      console.error('Failed to send role update notification:', notifyErr);
    }

    res.json({
      success: true,
      data: user,
      message: `User role updated to ${role}`
    });

  } catch (error) {
    console.error('Admin update role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message
    });
  }
});

// @route   GET /api/admin/experiences
// @desc    Get all experiences with pagination and filtering
// @access  Admin
router.get('/experiences', isAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status,
      userSearch,
      companySearch,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      _id
    } = req.query;

    // Build filter object
    let filter = {};
    if (_id && _id.trim() !== '') {
      // Validate ObjectId
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(_id.trim())) {
        filter = { _id: new mongoose.Types.ObjectId(_id.trim()) };
      } else {
        return res.status(400).json({ success: false, message: 'Invalid experience ID' });
      }
    } else {
      if (status === 'published') {
        filter.isPublished = true;
        filter.flagged = { $ne: true };
      } else if (status === 'draft') {
        filter.isPublished = false;
        filter.flagged = { $ne: true };
      } else if (status === 'flagged') {
        filter.flagged = true;
      }
    }

    // Build aggregation pipeline for user and company search
    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      }
    ];

    // Add user search filter
    if (userSearch && userSearch !== '') {
      pipeline.push({
        $match: {
          $or: [
            { 'user.name': { $regex: userSearch, $options: 'i' } },
            { 'user.email': { $regex: userSearch, $options: 'i' } }
          ]
        }
      });
    }

    // Add company search filter
    if (companySearch && companySearch !== '') {
      pipeline.push({
        $match: {
          'companyInfo.companyName': { $regex: companySearch, $options: 'i' }
        }
      });
    }

    // Add status/_id filter
    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }

    // Add sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: sort });

    // Execute aggregation to get total count
    const totalPipeline = [...pipeline, { $count: "total" }];
    const totalResult = await Experience.aggregate(totalPipeline);
    const totalExperiences = totalResult[0]?.total || 0;

    // Add pagination
    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    // Execute main aggregation
    const experiences = await Experience.aggregate(pipeline);

    const totalPages = Math.ceil(totalExperiences / limit);

    res.json({
      success: true,
      data: {
        experiences: experiences.map(exp => ({
          ...exp,
          userId: exp.user // Map user data to userId for frontend compatibility
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total: totalExperiences,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Admin experiences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch experiences',
      error: error.message
    });
  }
});

// @route   POST /api/admin/experiences/:id/moderate
// @desc    Moderate experience (approve, reject, flag)
// @access  Admin
router.post('/experiences/:id/moderate', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason, reasonDetails } = req.body;

    const validActions = ['approve', 'reject', 'flag', 'unflag', 'unpublish'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action provided'
      });
    }

    // Find the experience first to get owner info
    const experience = await Experience.findById(id).populate('userId', 'name email');
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    let updateData = {};
    let notificationData = null;

    switch (action) {
      case 'approve':
        updateData = { 
          isPublished: true, 
          flagged: false,
          flaggedAt: null,
          flaggedBy: null,
          flagReason: null,
          flagReasonDetails: null
        };
        notificationData = {
          recipient: experience.userId._id,
          type: 'experience_approved',
          title: 'Experience Approved',
          message: `Your experience at ${experience.companyInfo?.companyName} has been approved and is now published.`,
          relatedExperience: experience._id,
          actionUrl: `/experiences/${experience._id}`,
          priority: 'medium'
        };
        break;
      case 'reject':
      case 'unpublish':
        updateData = { isPublished: false };
        notificationData = {
          recipient: experience.userId._id,
          type: 'experience_rejected',
          title: 'Experience Unpublished',
          message: `Your experience at ${experience.companyInfo?.companyName} has been unpublished and is no longer visible to other users.`,
          relatedExperience: experience._id,
          actionUrl: `/profile`,
          priority: 'high'
        };
        break;
      case 'flag':
        updateData = { 
          flagged: true,
          flaggedAt: new Date(),
          flaggedBy: req.user._id,
          flagReason: reason,
          flagReasonDetails: reasonDetails
        };
        
        // Create detailed notification for flagging
        const reasonDisplayMap = {
          'inappropriate_content': 'Inappropriate Content',
          'fake_information': 'Fake Information',
          'spam': 'Spam',
          'offensive_language': 'Offensive Language',
          'copyright_violation': 'Copyright Violation',
          'personal_attacks': 'Personal Attacks',
          'off_topic': 'Off Topic',
          'duplicate_content': 'Duplicate Content',
          'other': 'Other'
        };

        notificationData = {
          recipient: experience.userId._id,
          type: 'experience_flagged',
          title: 'Content Flagged',
          message: `Your experience at ${experience.companyInfo?.companyName} has been flagged for: ${reasonDisplayMap[reason] || reason}. ${reasonDetails ? `Details: ${reasonDetails}` : ''}`,
          relatedExperience: experience._id,
          flagReason: reason,
          flagReasonDetails: reasonDetails,
          actionUrl: `/experiences/${experience._id}`,
          priority: 'urgent',
          metadata: {
            flaggedBy: req.user.name,
            flaggedAt: new Date()
          }
        };
        break;
      case 'unflag':
        updateData = { 
          flagged: false,
          flaggedAt: null,
          flaggedBy: null,
          flagReason: null,
          flagReasonDetails: null
        };
        notificationData = {
          recipient: experience.userId._id,
          type: 'experience_unflagged',
          title: 'Content Unflagged',
          message: `Your experience at ${experience.companyInfo?.companyName} has been reviewed and is no longer flagged.`,
          relatedExperience: experience._id,
          actionUrl: `/experiences/${experience._id}`,
          priority: 'medium'
        };
        break;
    }

    // Update the experience
    const updatedExperience = await Experience.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('userId', 'name email');

    // Create notification for the experience owner
    if (notificationData) {
      try {
        await Notification.create(notificationData);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the main action if notification fails
      }
    }

    res.json({
      success: true,
      data: updatedExperience,
      message: `Experience ${action}ed successfully`
    });

  } catch (error) {
    console.error('Admin moderate experience error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to moderate experience',
      error: error.message
    });
    }
});

// @route   GET /api/admin/notifications/:userId
// @desc    Get all notifications for a user
// @access  Private (Admin)
router.get('/notifications/:userId', isAdminWithDualAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10, unreadOnly = false } = req.query;

        const filter = { user: userId };
        if (unreadOnly === 'true') {
            filter.isRead = false;
        }

        const notifications = await Notification.find(filter)
            .populate('relatedExperience', 'title companyInfo')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Notification.countDocuments(filter);

        res.json({
            notifications,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// @route   PUT /api/admin/notifications/:notificationId/read
// @desc    Mark notification as read
// @access  Private (Admin)
router.put('/notifications/:notificationId/read', isAdminWithDualAuth, async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { isRead: true, readAt: new Date() },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification marked as read', notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error marking notification as read' });
    }
});

// =====================
// Admin Companies CRUD
// =====================

// @route   GET /api/admin/companies
// @desc    Get all companies
// @access  Admin
router.get('/companies', isAdminWithDualAuth, async (req, res) => {
  try {
    const companies = await Company.find().sort({ displayName: 1 });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch companies', error: error.message });
  }
});

// @route   POST /api/admin/companies
// @desc    Add a new company
// @access  Admin
router.post('/companies', isAdminWithDualAuth, async (req, res) => {
  try {
    const { displayName, logo, website, linkedinUrl, industry, size, aliases, isVerified } = req.body;
    if (!displayName) return res.status(400).json({ success: false, message: 'Display name is required' });
    const name = displayName.toLowerCase().trim();
    const company = new Company({
      name,
      displayName: displayName.trim(),
      logo: logo || '',
      website: website || '',
      linkedinUrl: linkedinUrl || '',
      industry: industry || '',
      size: size || '',
      aliases: Array.isArray(aliases) ? aliases : (typeof aliases === 'string' ? aliases.split(',').map(a => a.trim()).filter(Boolean) : []),
      isVerified: !!isVerified
    });
    await company.save();
    res.status(201).json(company);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add company', error: error.message });
  }
});

// @route   PUT /api/admin/companies/:id
// @desc    Edit a company
// @access  Admin
router.put('/companies/:id', isAdminWithDualAuth, async (req, res) => {
  try {
    const { displayName, logo, website, linkedinUrl, industry, size, aliases, isVerified } = req.body;
    const update = {
      displayName: displayName?.trim(),
      logo: logo || '',
      website: website || '',
      linkedinUrl: linkedinUrl || '',
      industry: industry || '',
      size: size || '',
      aliases: Array.isArray(aliases) ? aliases : (typeof aliases === 'string' ? aliases.split(',').map(a => a.trim()).filter(Boolean) : []),
      isVerified: !!isVerified
    };
    if (displayName) update.name = displayName.toLowerCase().trim();
    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    res.json(company);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update company', error: error.message });
  }
});

// @route   DELETE /api/admin/companies/:id
// @desc    Delete a company
// @access  Admin
router.delete('/companies/:id', isAdminWithDualAuth, async (req, res) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    res.json({ success: true, message: 'Company deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete company', error: error.message });
  }
});

// @route   GET /api/admin/company-requests
// @desc    Get company creation requests based on status
// @access  Admin
router.get('/company-requests', isAdminWithDualAuth, async (req, res) => {
  try {
    const { status = 'pending' } = req.query; // pending, approved, rejected, all
    
    let filter = { type: 'company_creation_request' };
    
    // Filter based on status
    if (status === 'pending') {
      filter.$or = [
        { 'metadata.status': { $exists: false } },  // No status field means pending
        { 'metadata.status': 'pending' }            // Explicitly set as pending
      ];
    } else if (status === 'approved') {
      filter['metadata.status'] = 'approved';
    } else if (status === 'rejected') {
      filter['metadata.status'] = 'rejected';
    }
    // For 'all', we don't add additional filters

    const requests = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent too many results

    // Group by requestIdentifier to avoid duplicates (one per admin)
    const uniqueRequestsMap = new Map();
    requests.forEach(request => {
      const identifier = request.metadata?.requestIdentifier;
      if (identifier && !uniqueRequestsMap.has(identifier)) {
        uniqueRequestsMap.set(identifier, request);
      } else if (!identifier) {
        // For old requests without requestIdentifier, use _id as fallback
        uniqueRequestsMap.set(request._id.toString(), request);
      }
    });

    const formattedRequests = Array.from(uniqueRequestsMap.values()).map(request => ({
      _id: request._id,
      companyName: request.metadata?.companyName,
      requestedBy: request.metadata?.requestedByName,
      requestedByEmail: request.metadata?.requestedByEmail,
      requestedByRollNumber: request.metadata?.requestedByRollNumber,
      requestedById: request.metadata?.requestedBy,
      createdAt: request.createdAt,
      message: request.message,
      status: request.metadata?.status || 'pending',  // Default to pending if no status
      processedAt: request.metadata?.processedAt,
      processedBy: request.metadata?.processedBy,
      rejectionReason: request.metadata?.rejectionReason,
      companyId: request.metadata?.companyId,
      requestIdentifier: request.metadata?.requestIdentifier
    }));

    res.json({ 
      success: true, 
      data: formattedRequests,
      meta: {
        status,
        count: formattedRequests.length
      }
    });
  } catch (error) {
    console.error('Error fetching company requests:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch company requests' 
    });
  }
});

// @route   POST /api/admin/company-requests/:requestId/approve
// @desc    Approve a company creation request and create the company
// @access  Admin
router.post('/company-requests/:requestId/approve', isAdminWithDualAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { companyData } = req.body; // Optional: allow admin to modify company data

    // Find the request notification
    const request = await Notification.findById(requestId);
    if (!request || request.type !== 'company_creation_request') {
      return res.status(404).json({
        success: false,
        message: 'Company creation request not found'
      });
    }

    const companyName = request.metadata?.companyName;
    const requestedBy = request.metadata?.requestedBy;

    if (!companyName || !requestedBy) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data'
      });
    }

    // Check if company already exists
    const existingCompany = await Company.findOne({
      $or: [
        { name: { $regex: `^${companyName}$`, $options: 'i' } },
        { displayName: { $regex: `^${companyName}$`, $options: 'i' } }
      ]
    });

    if (existingCompany) {
      // Update all related notifications (for all admins) using requestIdentifier
      const requestIdentifier = request.metadata?.requestIdentifier;
      if (requestIdentifier) {
        await Notification.updateMany(
          { 
            type: 'company_creation_request',
            'metadata.requestIdentifier': requestIdentifier
          },
          {
            $set: {
              'metadata.status': 'approved',
              'metadata.processedBy': req.user._id,
              'metadata.processedAt': new Date(),
              'metadata.companyId': existingCompany._id,
              read: true,
              readAt: new Date()
            }
          }
        );
      } else {
        // Fallback for old notifications without requestIdentifier
        request.metadata = {
          ...request.metadata,
          status: 'approved',
          processedBy: req.user._id,
          processedAt: new Date(),
          companyId: existingCompany._id
        };
        request.read = true;
        request.readAt = new Date();
        await request.save();
      }

      // Notify the requesting user
      await Notification.createNotification({
        recipient: requestedBy,
        type: 'company_creation_approved',
        title: 'Company Already Available',
        message: `Good news! The company "${companyName}" already exists in our database.`,
        metadata: {
          companyId: existingCompany._id,
          companyName: existingCompany.displayName,
          approvedBy: req.user._id
        },
        actionUrl: `/companies/${existingCompany._id}`
      });

      return res.json({
        success: true,
        message: 'Company already exists',
        data: existingCompany
      });
    }

    // Create the new company
    const newCompany = new Company({
      name: companyName,
      displayName: companyData?.displayName || companyName,
      logo: companyData?.logo || '',
      website: companyData?.website || '',
      industry: companyData?.industry || '',
      size: companyData?.size || '',
      linkedinUrl: companyData?.linkedinUrl || '',
      isVerified: companyData?.isVerified || false,
      aliases: companyData?.aliases || []
    });

    await newCompany.save();

    // Update all related notifications (for all admins) using requestIdentifier
    const requestIdentifier = request.metadata?.requestIdentifier;
    if (requestIdentifier) {
      await Notification.updateMany(
        { 
          type: 'company_creation_request',
          'metadata.requestIdentifier': requestIdentifier
        },
        {
          $set: {
            'metadata.status': 'approved',
            'metadata.processedBy': req.user._id,
            'metadata.processedAt': new Date(),
            'metadata.companyId': newCompany._id,
            read: true,
            readAt: new Date()
          }
        }
      );
    } else {
      // Fallback for old notifications without requestIdentifier
      request.metadata = {
        ...request.metadata,
        status: 'approved',
        processedBy: req.user._id,
        processedAt: new Date(),
        companyId: newCompany._id
      };
      request.read = true;
      request.readAt = new Date();
      await request.save();
    }

    // Notify the requesting user
    await Notification.createNotification({
      recipient: requestedBy,
      type: 'company_creation_approved',
      title: 'Company Created Successfully',
      message: `Your requested company "${companyName}" has been created by an admin.`,
      metadata: {
        companyId: newCompany._id,
        companyName: newCompany.displayName,
        approvedBy: req.user._id
      },
      actionUrl: `/companies/${newCompany._id}`
    });

    res.json({
      success: true,
      message: 'Company created and user notified',
      data: newCompany
    });

  } catch (error) {
    console.error('Error approving company request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve company request'
    });
  }
});

// @route   POST /api/admin/company-requests/:requestId/reject
// @desc    Reject a company creation request
// @access  Admin
router.post('/company-requests/:requestId/reject', isAdminWithDualAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    // Find the request notification
    const request = await Notification.findById(requestId);
    if (!request || request.type !== 'company_creation_request') {
      return res.status(404).json({
        success: false,
        message: 'Company creation request not found'
      });
    }

    const companyName = request.metadata?.companyName;
    const requestedBy = request.metadata?.requestedBy;

    // Update all related notifications (for all admins) using requestIdentifier
    const requestIdentifier = request.metadata?.requestIdentifier;
    if (requestIdentifier) {
      await Notification.updateMany(
        { 
          type: 'company_creation_request',
          'metadata.requestIdentifier': requestIdentifier
        },
        {
          $set: {
            'metadata.status': 'rejected',
            'metadata.processedBy': req.user._id,
            'metadata.processedAt': new Date(),
            'metadata.rejectionReason': reason || 'No reason provided',
            read: true,
            readAt: new Date()
          }
        }
      );
    } else {
      // Fallback for old notifications without requestIdentifier
      request.metadata = {
        ...request.metadata,
        status: 'rejected',
        processedBy: req.user._id,
        processedAt: new Date(),
        rejectionReason: reason || 'No reason provided'
      };
      request.read = true;
      request.readAt = new Date();
      await request.save();
    }

    // Notify the requesting user
    await Notification.createNotification({
      recipient: requestedBy,
      type: 'company_creation_rejected',
      title: 'Company Request Rejected',
      message: `Your request to create company "${companyName}" has been rejected. ${reason ? `Reason: ${reason}` : ''}`,
      metadata: {
        companyName: companyName,
        rejectedBy: req.user._id,
        rejectionReason: reason || 'No reason provided'
      }
    });

    res.json({
      success: true,
      message: 'Company request rejected and user notified'
    });

  } catch (error) {
    console.error('Error rejecting company request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject company request'
    });
  }
});

// @route   PUT /api/admin/company-requests/:requestId/change-status
// @desc    Change the status of a previously processed company request
// @access  Admin
router.put('/company-requests/:requestId/change-status', isAdminWithDualAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { newStatus, reason } = req.body; // newStatus: 'pending', 'approved', 'rejected'

    // Find the request notification
    const request = await Notification.findById(requestId);
    if (!request || request.type !== 'company_creation_request') {
      return res.status(404).json({
        success: false,
        message: 'Company creation request not found'
      });
    }

    const companyName = request.metadata?.companyName;
    const requestedBy = request.metadata?.requestedBy;

    if (!companyName || !requestedBy) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data'
      });
    }

    // Update the request status
    if (newStatus === 'pending') {
      // Revert to pending status
      request.read = false;
      request.readAt = null;
      request.metadata = {
        ...request.metadata,
        status: undefined,
        processedBy: undefined,
        processedAt: undefined,
        rejectionReason: undefined
      };
    } else if (newStatus === 'approved') {
      // Change to approved (or re-approve)
      request.read = true;
      request.readAt = new Date();
      request.metadata = {
        ...request.metadata,
        status: 'approved',
        processedBy: req.user._id,
        processedAt: new Date(),
        rejectionReason: undefined
      };
    } else if (newStatus === 'rejected') {
      // Change to rejected
      request.read = true;
      request.readAt = new Date();
      request.metadata = {
        ...request.metadata,
        status: 'rejected',
        processedBy: req.user._id,
        processedAt: new Date(),
        rejectionReason: reason || 'Status changed by admin'
      };
    }

    await request.save();

    // Notify the requesting user about the status change
    let notificationTitle, notificationMessage;
    
    if (newStatus === 'pending') {
      notificationTitle = 'Company Request Reopened';
      notificationMessage = `Your company creation request for "${companyName}" has been reopened and is being reviewed again.`;
    } else if (newStatus === 'approved') {
      notificationTitle = 'Company Request Approved';
      notificationMessage = `Your company creation request for "${companyName}" has been approved.`;
    } else if (newStatus === 'rejected') {
      notificationTitle = 'Company Request Status Changed';
      notificationMessage = `Your company creation request for "${companyName}" status has been updated. ${reason ? `Reason: ${reason}` : ''}`;
    }

    await Notification.createNotification({
      recipient: requestedBy,
      type: newStatus === 'approved' ? 'company_creation_approved' : 'company_creation_rejected',
      title: notificationTitle,
      message: notificationMessage,
      metadata: {
        companyName: companyName,
        statusChangedBy: req.user._id,
        newStatus: newStatus,
        reason: reason || ''
      }
    });

    res.json({
      success: true,
      message: `Request status changed to ${newStatus} and user notified`,
      data: {
        requestId,
        newStatus,
        companyName
      }
    });

  } catch (error) {
    console.error('Error changing request status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change request status'
    });
  }
});

// @route   GET /api/admin/experiences/reported
// @desc    Get all experiences with reports
// @access  Admin
router.get('/experiences/reported', isAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      reportStatus, // pending, reviewed, resolved, dismissed
      search
    } = req.query;

    // Build filter - only get experiences that have reports
    const filter = {
      reports: { $exists: true, $ne: [] }
    };

    // Filter by report status if provided
    if (reportStatus && reportStatus !== 'all') {
      filter['reports.status'] = reportStatus;
    }

    // Search filter
    if (search && search !== '') {
      filter.$or = [
        { 'companyInfo.companyName': { $regex: search, $options: 'i' } },
        { 'companyInfo.role': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [experiences, total] = await Promise.all([
      Experience.find(filter)
        .populate('reports.reportedBy', 'name email')
        .populate('userId', 'name email')
        .sort({ 'reports.reportedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Experience.countDocuments(filter)
    ]);

    res.json({
      success: true,
      experiences,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching reported experiences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reported experiences',
      error: error.message
    });
  }
});

// @route   GET /api/admin/experiences/report-stats
// @desc    Get report statistics
// @access  Admin
router.get('/experiences/report-stats', isAdmin, async (req, res) => {
  try {
    // Aggregate report statistics
    const statsResult = await Experience.aggregate([
      {
        $match: {
          reports: { $exists: true, $ne: [] }
        }
      },
      {
        $unwind: '$reports'
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$reports.status', 'pending'] }, 1, 0] }
          },
          reviewed: {
            $sum: { $cond: [{ $eq: ['$reports.status', 'reviewed'] }, 1, 0] }
          },
          resolved: {
            $sum: { $cond: [{ $eq: ['$reports.status', 'resolved'] }, 1, 0] }
          },
          dismissed: {
            $sum: { $cond: [{ $eq: ['$reports.status', 'dismissed'] }, 1, 0] }
          }
        }
      }
    ]);

    // Count flagged experiences
    const flagged = await Experience.countDocuments({ flagged: true });

    const stats = statsResult.length > 0 ? {
      total: statsResult[0].total,
      pending: statsResult[0].pending,
      reviewed: statsResult[0].reviewed,
      resolved: statsResult[0].resolved,
      dismissed: statsResult[0].dismissed,
      flagged
    } : {
      total: 0,
      pending: 0,
      reviewed: 0,
      resolved: 0,
      dismissed: 0,
      flagged
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report statistics',
      error: error.message
    });
  }
});

// @route   PATCH /api/admin/experiences/:experienceId/reports/:reportId
// @desc    Update a specific report status
// @access  Admin
router.patch('/experiences/:experienceId/reports/:reportId', isAdmin, async (req, res) => {
  try {
    const { experienceId, reportId } = req.params;
    const { status, action } = req.body;

    // Validate status
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status provided'
      });
    }

    // Find the experience
    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    // Find the specific report
    const report = experience.reports.id(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Update report status
    report.status = status;
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();

    // If resolving all reports, unflag the experience
    if (status === 'resolved' || status === 'dismissed') {
      const allReportsResolved = experience.reports.every(r => 
        r._id.equals(report._id) || 
        r.status === 'resolved' || 
        r.status === 'dismissed'
      );

      if (allReportsResolved) {
        experience.flagged = false;
        experience.flaggedBy = null;
        experience.flagReason = null;
      }
    }

    await experience.save();

    // Send notification to the reporter using admin_message type
    try {
      await Notification.createNotification({
        recipient: report.reportedBy,
        type: 'admin_message',
        title: 'Report Status Updated',
        message: `Your report on "${experience.companyInfo?.companyName} - ${experience.companyInfo?.role}" has been ${status}.`,
        relatedExperience: experience._id,
        metadata: {
          experienceId: experience._id,
          reportId: report._id,
          status,
          companyName: experience.companyInfo?.companyName,
          notificationType: 'report_status_update'
        }
      });
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Continue even if notification fails
    }

    res.json({
      success: true,
      message: `Report ${status} successfully`,
      data: {
        experience,
        report
      }
    });

  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update report status',
      error: error.message
    });
  }
});

// @route   PATCH /api/admin/experiences/:experienceId/unpublish
// @desc    Unpublish an experience (remove from public view)
// @access  Admin
router.patch('/experiences/:experienceId/unpublish', isAdmin, async (req, res) => {
  try {
    const { experienceId } = req.params;
    const { reason, flagReason } = req.body;

    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    // Unpublish and flag the experience
    experience.isPublished = false;
    experience.flagged = true;
    experience.flaggedBy = req.user._id;
    experience.flagReason = flagReason || 'multiple_reports';
    experience.flaggedAt = new Date();

    await experience.save();

    // Notify the experience owner using experience_flagged type
    try {
      await Notification.createNotification({
        recipient: experience.userId,
        type: 'experience_flagged',
        title: 'Experience Unpublished',
        message: `Your experience at "${experience.companyInfo?.companyName} - ${experience.companyInfo?.role}" has been unpublished. ${reason || 'It violated our community guidelines.'}`,
        relatedExperience: experience._id,
        flagReason: experience.flagReason,
        flagReasonDetails: reason,
        actionUrl: `/experiences/${experience._id}/edit`,
        metadata: {
          experienceId: experience._id,
          companyName: experience.companyInfo?.companyName,
          reason,
          flagReason: experience.flagReason,
          unpublishedBy: req.user._id,
          notificationType: 'experience_unpublished'
        }
      });
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Continue even if notification fails
    }

    res.json({
      success: true,
      message: 'Experience unpublished successfully',
      data: experience
    });

  } catch (error) {
    console.error('Error unpublishing experience:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unpublish experience',
      error: error.message
    });
  }
});

// Announcement/news route
const adminAnnounceRoutes = require('./admin_announce');
router.use(adminAnnounceRoutes);

// Download experiences route
const downloadExperiencesRoutes = require('./downloadExperiences');
router.use('/download', downloadExperiencesRoutes);

module.exports = router;
