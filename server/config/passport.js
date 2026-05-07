const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { isSuperAdminEmail } = require('./superAdmin');
const { USER_ROLES } = require('../utils/roles');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Extract email and validate domain
    const email = profile.emails[0]?.value?.toLowerCase();
    
    if (!email) {
      return done(new Error('No email found in Google profile'), null);
    }
    
    const emailDomain = email.split('@')[1];
    const isSuperAdmin = isSuperAdminEmail(email);
    
    // Only allow PSG Tech emails, plus explicit permanent super admin accounts.
    if (emailDomain !== 'psgtech.ac.in' && !isSuperAdmin) {
      return done(new Error('Access restricted to PSG Tech students only. Please use your PSG Tech email address.'), null);
    }
    
    // Check if user already exists. Super admins may be seeded by email before
    // their first Google login, so email lookup lets OAuth claim that record.
    let existingUser = await User.findOne({
      $or: [
        { googleId: profile.id },
        { email }
      ]
    });
    
    if (existingUser) {
      // Update user info if needed
      existingUser.googleId = profile.id;
      existingUser.name = profile.displayName;
      existingUser.avatar = profile.photos[0]?.value;
      existingUser.email = email; // Update email in case it changed
      if (isSuperAdmin && existingUser.role !== USER_ROLES.SUPER_ADMIN) {
        existingUser.role = USER_ROLES.SUPER_ADMIN;
      }
      await existingUser.save();
      return done(null, existingUser);
    }

    // Create new user
    const newUser = new User({
      googleId: profile.id,
      email: email,
      name: profile.displayName,
      avatar: profile.photos[0]?.value,
      role: isSuperAdmin ? USER_ROLES.SUPER_ADMIN : USER_ROLES.STUDENT,
      university: 'PSG College of Technology',
      isEmailVerified: true,
      joinedAt: new Date()
    });

    await newUser.save();
    return done(null, newUser);
  } catch (error) {
    // console.error('Error in Google Strategy:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
