const DEFAULT_SUPER_ADMIN_EMAILS = ['hemanthlaxvel@gmail.com'];

const parseEmailList = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
};

const getSuperAdminEmails = () => {
  const configuredEmails = [
    ...parseEmailList(process.env.SUPER_ADMIN_EMAILS),
    ...parseEmailList(process.env.EMERGENCY_SUPER_ADMIN_EMAILS)
  ];

  return new Set([...DEFAULT_SUPER_ADMIN_EMAILS, ...configuredEmails]);
};

const isSuperAdminEmail = (email) => {
  if (!email) return false;
  return getSuperAdminEmails().has(email.toLowerCase());
};

module.exports = {
  isSuperAdminEmail
};
