export const USER_ROLES = {
  STUDENT: 'Student',
  MODERATOR: 'Moderator',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'SuperAdmin'
};

export const ADMIN_ROLES = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN];

export const isAdminRole = (role) => ADMIN_ROLES.includes(role);
export const isSuperAdminRole = (role) => role === USER_ROLES.SUPER_ADMIN;
