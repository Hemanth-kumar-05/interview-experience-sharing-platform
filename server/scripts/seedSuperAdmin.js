const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('../models/User');
const AdminAuth = require('../admin/models/AdminAuth');
const { isSuperAdminEmail } = require('../config/superAdmin');
const { USER_ROLES } = require('../utils/roles');

dotenv.config();

const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
};

const firstConfiguredSuperAdminEmail = () => {
  return (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)[0] || 'hemanthlaxvel@gmail.com';
};

const usage = () => {
  console.log([
    'Usage:',
    '  npm run seed:super-admin -- --password=StrongPass123! [--email=hemanthlaxvel@gmail.com] [--username=hemanth_super_admin]',
    '',
    'This creates or updates one Admin user and one DB-backed AdminAuth record.',
    'The password is hashed by the AdminAuth model before it is saved.'
  ].join('\n'));
};

const main = async () => {
  const email = (getArg('email') || firstConfiguredSuperAdminEmail()).toLowerCase();
  const username = getArg('username') || 'hemanth_super_admin';
  const password = getArg('password');

  if (!password || password.length < 8) {
    usage();
    throw new Error('A password with at least 8 characters is required.');
  }

  if (!isSuperAdminEmail(email)) {
    throw new Error(`${email} is not listed in SUPER_ADMIN_EMAILS.`);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/interview-platform');

  const user = await User.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        googleId: `super-admin:${email}`,
        name: 'Super Admin',
        university: 'PSG College of Technology',
        isEmailVerified: true,
        joinedAt: new Date()
      },
      $set: {
        role: USER_ROLES.SUPER_ADMIN
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  const usernameOwner = await AdminAuth.findOne({ adminUsername: username });
  if (usernameOwner && !usernameOwner.users.map(id => id.toString()).includes(user._id.toString())) {
    throw new Error(`Admin username "${username}" is already assigned to another user.`);
  }

  let adminAuth = await AdminAuth.findOne({ users: user._id });
  if (!adminAuth) {
    adminAuth = new AdminAuth({
      users: [user._id],
      adminUsername: username,
      adminPassword: password,
      createdBy: user._id
    });
  } else {
    adminAuth.adminUsername = username;
    adminAuth.adminPassword = password;
    adminAuth.isActive = true;
  }

  await adminAuth.save();

  console.log(`Super admin user ready: ${user.email}`);
  console.log(`Admin username ready: ${adminAuth.adminUsername}`);
};

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
