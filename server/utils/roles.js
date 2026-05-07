const USER_ROLES = {
  STUDENT: 'Student',
  MODERATOR: 'Moderator',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'SuperAdmin'
};

const ADMIN_ROLES = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN];
const MODERATOR_ROLES = [USER_ROLES.MODERATOR, ...ADMIN_ROLES];
const ASSIGNABLE_ROLES = [USER_ROLES.STUDENT, USER_ROLES.MODERATOR, USER_ROLES.ADMIN];

const isAdminRole = (role) => ADMIN_ROLES.includes(role);
const isModeratorRole = (role) => MODERATOR_ROLES.includes(role);
const isSuperAdminRole = (role) => role === USER_ROLES.SUPER_ADMIN;

module.exports = {
  USER_ROLES,
  ADMIN_ROLES,
  ASSIGNABLE_ROLES,
  isAdminRole,
  isModeratorRole,
  isSuperAdminRole
};
