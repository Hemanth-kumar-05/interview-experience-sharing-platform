const express = require('express');
const passport = require('passport');
const router = express.Router();
const { isAdminRole } = require('../utils/roles');

// @route   GET /auth/google
// @desc    Start Google OAuth
// @access  Public
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

// @route   GET /auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) {
        // Handle domain restriction error
        if (err.message.includes('PSG Tech')) {
          return res.redirect(`${process.env.CLIENT_URL}/login?error=domain_restricted`);
        }
        // Handle other authentication errors
        return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
      }
      
      if (!user) {
        return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
      }
      
      // Login the user
      req.logIn(user, (err) => {
        if (err) {
          return res.redirect(`${process.env.CLIENT_URL}/login?error=login_failed`);
        }
        
        // Redirect admin users to admin panel
        if (isAdminRole(user.role)) {
          return res.redirect(`${process.env.CLIENT_URL}/admin`);
        }
        
        return res.redirect(process.env.CLIENT_URL || 'http://localhost:3000');
      });
    })(req, res, next);
  }
);

// @route   GET /auth/user
// @desc    Get current user
// @access  Private
router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        role: req.user.role,
        university: req.user.university,
        graduationYear: req.user.graduationYear,
        points: req.user.points,
        level: req.user.level,
        badges: req.user.badges,
        stats: req.user.stats,
        preferences: req.user.preferences,
        backgroundData: req.user.backgroundData
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// @route   POST /auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error logging out'
      });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Error destroying session'
        });
      }
      res.clearCookie('connect.sid');
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });
});

// @route   GET /auth/status
// @desc    Check authentication status
// @access  Public
router.get('/status', (req, res) => {
  res.json({
    isAuthenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      role: req.user.role
    } : null
  });
});

module.exports = router;
