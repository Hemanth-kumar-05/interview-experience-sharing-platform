import React, { useState, useEffect } from 'react';
import { createApiUrl } from '../../config/api';
import { isAdminRole, isSuperAdminRole } from '../../utils/roles';
import PSGNotification from '../../components/PSGNotification';
import SearchableDropdown from '../../components/SearchableDropdown';
import Avatar from '../../components/Avatar';
import { 
  Users, 
  Search, 
  Filter, 
  RefreshCw, 
  ShieldCheck,
  Crown,
  GraduationCap,
  Calendar,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Shield,
  X,
  UserPlus,
  Settings,
  Bell,
  Send,
  MessageSquare,
  CheckSquare,
  Square,
  Mail,
  MapPin,
  Building,
  School,
  GitBranch,
  Briefcase
} from 'lucide-react';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    role: '',
    search: '',
    branch: [],
    department: [],
    graduationYear: [],
    // yearOfStudy: [],
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState({});
  const [notification, setNotification] = useState({ open: false, message: '', type: 'info' });

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    branches: [],
    departments: [],
    // yearsOfStudy: [],
    graduationYears: [],
    roles: []
  });

  // Notification states
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationPriority, setNotificationPriority] = useState('normal');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [selectAll, setSelectAll] = useState(false);


  // Always use the latest filters when fetching users
  useEffect(() => {
    fetchUsers(filters);
  }, [filters]);

  // Fetch filter options on component mount
  useEffect(() => {
    fetchFilterOptions();
  }, []);

  // Fetch filter options from backend
  const fetchFilterOptions = async () => {
    try {
      const response = await fetch(createApiUrl('/api/users/admin/filter-options'), {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFilterOptions(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  // Fetch users with given filters
  const fetchUsers = async (customFilters = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // Add simple string/number filters
      Object.keys(customFilters).forEach(key => {
        const value = customFilters[key];
        if (value && !Array.isArray(value)) {
          params.append(key, value);
        }
      });
      
      // Handle array filters specially
      ['branch', 'department', 'graduationYear'].forEach(arrayField => {
        const arrayValue = customFilters[arrayField];
        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
          arrayValue.forEach(item => {
            params.append(arrayField, item);
          });
        }
      });

      const response = await fetch(createApiUrl(`/api/users/admin/all?${params.toString()}`), {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsers(data.data || []);
          setPagination(data.pagination || {});
        }
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  // Modal state for admin creds
  const [showAdminCredsModal, setShowAdminCredsModal] = useState(false);
  const [adminCredsMode, setAdminCredsMode] = useState('new'); // 'new' or 'existing'
  const [adminCredsUser, setAdminCredsUser] = useState(null); // user object
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [existingCreds, setExistingCreds] = useState([]);
  const [selectedCredId, setSelectedCredId] = useState('');
  const [adminCredsLoading, setAdminCredsLoading] = useState(false);
  const [adminCredsError, setAdminCredsError] = useState('');

  // Intercept role change to Admin for Student
  const handleRoleUpdate = async (userId, newRole, userObj) => {
    if (userObj.role === 'Student' && newRole === 'Admin') {
      // Show modal for admin creds
      setAdminCredsUser(userObj);
      setShowAdminCredsModal(true);
      setAdminCredsMode('new');
      setAdminUsername('');
      setAdminPassword('');
      setAdminCredsError('');
      setSelectedCredId('');
      // Fetch existing creds for dropdown
      try {
        setAdminCredsLoading(true);
        // Fetch all available admin creds (for demo, you may need to adjust endpoint)
        const res = await fetch(createApiUrl('/api/admin/auth/all'), {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'x-admin-token': localStorage.getItem('adminToken')
          }
        });
        if (res.ok) {
          const data = await res.json();
          setExistingCreds(data.data || []);
        } else {
          setExistingCreds([]);
        }
      } catch (e) {
        setExistingCreds([]);
      } finally {
        setAdminCredsLoading(false);
      }
      return;
    }
    // Normal role update
    try {
      const response = await fetch(createApiUrl(`/api/admin/users/${userId}/role`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsers(users.map(user => 
            user._id === userId ? { ...user, role: newRole } : user
          ));
          setNotification({ open: true, message: 'Role updated successfully', type: 'success' });
        }
      } else {
        setNotification({ open: true, message: 'Error updating role', type: 'error' });
      }
    } catch (err) {
      setNotification({ open: true, message: 'Error updating role', type: 'error' });
    }
  };

  // Handle admin creds modal submit
  const handleAdminCredsSubmit = async (e) => {
    e.preventDefault();
    setAdminCredsLoading(true);
    setAdminCredsError('');
    try {
      let result;
      if (adminCredsMode === 'new') {
        // Create new admin creds using /bootstrap
        const res = await fetch(createApiUrl('/api/admin/auth/create'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            userId: adminCredsUser._id,
            adminUsername,
            adminPassword
          })
        });
        result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to create admin credentials');
      } else {
        // Assign existing creds (you may need to implement this endpoint in backend)
        result = await fetch(createApiUrl(`/api/admin/auth/assign`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ userId: adminCredsUser._id, adminCredId: selectedCredId })
        });
        result = await result.json();
        if (!result.success) throw new Error(result.message || 'Failed to assign admin creds');
      }
      // Now update user role
      await fetch(createApiUrl(`/api/admin/users/${adminCredsUser._id}/role`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ role: 'Admin' })
      });
      setUsers(users.map(user => 
        user._id === adminCredsUser._id ? { ...user, role: 'Admin' } : user
      ));
      setNotification({ open: true, message: 'Admin credentials assigned and role updated!', type: 'success' });
      setShowAdminCredsModal(false);
    } catch (err) {
      setAdminCredsError(err.message || 'Failed to assign admin credentials');
    } finally {
      setAdminCredsLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1 // Reset to first page on filter change
    }));
  };

  // Handle multiselect filter changes
  const handleMultiSelectChange = (key, value) => {
    setFilters(prev => {
      const currentArray = prev[key] || [];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value) // Remove if exists
        : [...currentArray, value]; // Add if doesn't exist
      
      return {
        ...prev,
        [key]: newArray,
        page: 1 // Reset to first page on filter change
      };
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      role: '',
      search: '',
      branch: [],
      department: [],
      graduationYear: [],
      // yearOfStudy: [],
      page: 1,
      limit: 20
    });
  };

  // Notification handling functions
  const handleUserSelect = (userId) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
    setSelectAll(newSelected.size === users.filter(u => u.role === 'Student').length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers(new Set());
      setSelectAll(false);
    } else {
      const studentIds = users.filter(u => u.role === 'Student').map(u => u._id);
      setSelectedUsers(new Set(studentIds));
      setSelectAll(true);
    }
  };

  const openNotificationModal = () => {
    if (selectedUsers.size === 0) {
      setNotification({ open: true, message: 'Please select at least one student to send notifications', type: 'warning' });
      return;
    }
    setShowNotificationModal(true);
    setNotificationTitle('');
    setNotificationMessage('');
    setNotificationPriority('normal');
  };

  const sendNotification = async () => {
    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      setNotification({ open: true, message: 'Please fill in both title and message', type: 'error' });
      return;
    }

    setNotificationLoading(true);
    try {
      const response = await fetch(createApiUrl('/api/admin/notifications/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userIds: Array.from(selectedUsers),
          title: notificationTitle,
          message: notificationMessage,
          priority: notificationPriority,
          type: 'admin_announcement'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setNotification({ 
            open: true, 
            message: `Notification sent to ${selectedUsers.size} student(s) successfully`, 
            type: 'success' 
          });
          setShowNotificationModal(false);
          setSelectedUsers(new Set());
          setSelectAll(false);
        } else {
          setNotification({ open: true, message: data.message || 'Failed to send notification', type: 'error' });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setNotification({ open: true, message: errorData.message || 'Failed to send notification', type: 'error' });
      }
    } catch (err) {
      setNotification({ open: true, message: 'Error sending notification. Please try again.', type: 'error' });
    } finally {
      setNotificationLoading(false);
    }
  };

  // MultiSelect Component
  const MultiSelect = ({ label, icon: Icon, options, selected = [], onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 min-h-[42px] p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left"
          >
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selected.slice(0, 2).map(item => (
                  <span 
                    key={item}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded-md"
                  >
                    {item}
                  </span>
                ))}
                {selected.length > 2 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 py-1">
                    +{selected.length - 2} more
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-500 dark:text-gray-400 text-sm">{placeholder}</span>
            )}
          </button>
          
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
              {options.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    // Don't close dropdown for multiselect
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-600 border-b last:border-b-0 border-gray-200 dark:border-gray-600 ${
                    selected.includes(option) 
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{option}</span>
                    {selected.includes(option) && (
                      <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                </button>
              ))}
              {options.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No options available
                </div>
              )}
            </div>
          )}
          
          {/* Close dropdown when clicking outside */}
          {isOpen && (
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsOpen(false)}
            />
          )}
        </div>
      </div>
    );
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Loading users...</h3>
            <p className="text-gray-600 dark:text-gray-400">Please wait while we fetch the data.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <PSGNotification
          open={notification.open}
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, open: false })}
        />
        
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Manage user roles and permissions</p>
          </div>
          <button
            onClick={() => fetchUsers()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{pagination.total || users.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Students</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {users.filter(u => u.role === 'Student').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Moderators</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {users.filter(u => u.role === 'Moderator').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Admins</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {users.filter(u => isAdminRole(u.role)).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <Crown className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Users
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Search by name or email..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Filter by Role
              </label>
              <SearchableDropdown
                value={filters.role}
                onChange={(value) => handleFilterChange('role', value)}
                options={['', 'Student', 'Moderator', 'Admin', 'SuperAdmin']}
                placeholder="All Roles"
                icon={Filter}
              />
            </div>
          </div>

          {/* Enhanced Background Data Filters */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Background Data Filters</h3>
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                Clear All Filters
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <MultiSelect
                label="Branch"
                icon={GitBranch}
                options={filterOptions.branches}
                selected={filters.branch}
                onChange={(value) => handleMultiSelectChange('branch', value)}
                placeholder="Select branches..."
              />

              <MultiSelect
                label="Department"
                icon={Briefcase}
                options={filterOptions.departments}
                selected={filters.department}
                onChange={(value) => handleMultiSelectChange('department', value)}
                placeholder="Select departments..."
              />

              <MultiSelect
                label="Graduation Year"
                icon={GraduationCap}
                options={filterOptions.graduationYears}
                selected={filters.graduationYear}
                onChange={(value) => handleMultiSelectChange('graduationYear', value)}
                placeholder="Select graduation years..."
              />

              {/* <MultiSelect
                label="Year of Study"
                icon={Calendar}
                options={filterOptions.yearsOfStudy}
                selected={filters.yearOfStudy}
                onChange={(value) => handleMultiSelectChange('yearOfStudy', value)}
                placeholder="Select years of study..."
              /> */}
            </div>
          </div>
        </div>

        {/* Notification Center */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Notification Center
            </h3>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedUsers.size} student(s) selected
              </div>
              <button
                onClick={openNotificationModal}
                disabled={selectedUsers.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 font-medium"
              >
                <Send className="h-4 w-4" />
                Send Notification
              </button>
            </div>
          </div>
          
          {selectedUsers.size > 0 && (
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-3">
              <div className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                Ready to send notifications to {selectedUsers.size} student(s)
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                Select students from the table below and click "Send Notification" to compose your message
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 mb-8">
            <div className="flex items-center">
              <X className="w-6 h-6 text-red-600 dark:text-red-400 mr-3" />
              <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSelectAll}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          {selectAll ? 
                            <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : 
                            <Square className="h-4 w-4 text-gray-400" />
                          }
                        </button>
                        <span>Select All Students</span>
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Experiences
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4">
                        {user.role === 'Student' && (
                          <button
                            onClick={() => handleUserSelect(user._id)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            {selectedUsers.has(user._id) ? 
                              <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : 
                              <Square className="h-4 w-4 text-gray-400" />
                            }
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Avatar 
                            user={user} 
                            size={40} 
                            className="flex-shrink-0 mr-3" 
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.name}
                            </div>
                            {user.university && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {user.university}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-white">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isSuperAdminRole(user.role)
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : user.role === 'Admin' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' 
                            : user.role === 'Moderator'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {isAdminRole(user.role) && <Crown className="w-3 h-3 mr-1" />}
                          {user.role === 'Moderator' && <ShieldCheck className="w-3 h-3 mr-1" />}
                          {user.role === 'Student' && <GraduationCap className="w-3 h-3 mr-1" />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <Calendar className="w-4 h-4 text-gray-400 mr-1" />
                          <span className="text-sm text-gray-900 dark:text-white">
                            {new Date(user.joinedAt || user.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <BookOpen className="w-4 h-4 text-blue-500 mr-1" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {user.stats?.experiencesShared || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleUpdate(user._id, e.target.value, user)}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="Student">Student</option>
                          <option value="Moderator">Moderator</option>
                          <option value="Admin">Admin</option>
                          {isSuperAdminRole(user.role) && (
                            <option value="SuperAdmin">SuperAdmin</option>
                          )}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <Users className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No users found</h3>
              <p className="text-gray-600 dark:text-gray-400">Try adjusting your filters or check back later.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing page {pagination.currentPage} of {pagination.totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  disabled={loading || pagination.currentPage <= 1}
                  onClick={() => {
                    if (!loading && pagination.currentPage > 1) {
                      setFilters(prev => ({ ...prev, page: pagination.currentPage - 1 }));
                    }
                  }}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </button>
                
                {/* Page numbers */}
                <div className="hidden sm:flex space-x-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages || 1) }, (_, i) => {
                    let pageNum;
                    const totalPages = pagination.totalPages || 1;
                    const currentPage = pagination.currentPage || 1;
                    
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    // Ensure pageNum is within valid range
                    if (pageNum < 1 || pageNum > totalPages) {
                      return null;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => {
                          if (!loading && currentPage !== pageNum) {
                            setFilters(prev => ({ ...prev, page: pageNum }));
                          }
                        }}
                        disabled={loading}
                      >
                        {pageNum}
                      </button>
                    );
                  }).filter(Boolean)}
                  
                  {/* Show ellipsis and last page if needed */}
                  {pagination.totalPages > 5 && pagination.currentPage < pagination.totalPages - 2 && (
                    <>
                      <span className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">...</span>
                      <button
                        className="px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => {
                          if (!loading) {
                            setFilters(prev => ({ ...prev, page: pagination.totalPages }));
                          }
                        }}
                        disabled={loading}
                      >
                        {pagination.totalPages}
                      </button>
                    </>
                  )}
                </div>
                
                <button
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  disabled={loading || pagination.currentPage >= pagination.totalPages}
                  onClick={() => {
                    if (!loading && pagination.currentPage < pagination.totalPages) {
                      setFilters(prev => ({ ...prev, page: pagination.currentPage + 1 }));
                    }
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Admin Creds Modal */}
        {showAdminCredsModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 text-center">
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setShowAdminCredsModal(false)}></div>
              
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-xl max-w-md w-full mx-auto shadow-xl border border-white/20 dark:border-gray-700/30">
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mr-4">
                      <UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Assign Admin Credentials
                    </h3>
                  </div>
                  
                  <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Assign credentials for <strong>{adminCredsUser?.name}</strong> to become an Admin.
                    </p>
                  </div>
                  
                  <div className="flex mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      onClick={() => setAdminCredsMode('new')}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        adminCredsMode === 'new'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Create New
                    </button>
                    <button
                      onClick={() => setAdminCredsMode('existing')}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        adminCredsMode === 'existing'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Select Existing
                    </button>
                  </div>
                  
                  <form onSubmit={handleAdminCredsSubmit}>
                    {adminCredsMode === 'new' ? (
                      <div className="space-y-4 mb-6">
                        <input
                          type="text"
                          placeholder="Admin Username"
                          value={adminUsername}
                          onChange={e => setAdminUsername(e.target.value)}
                          required
                          minLength={3}
                          maxLength={50}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="password"
                          placeholder="Admin Password"
                          value={adminPassword}
                          onChange={e => setAdminPassword(e.target.value)}
                          required
                          minLength={8}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    ) : (
                      <div className="mb-6">
                        {adminCredsLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full mr-2"></div>
                            <span className="text-gray-600 dark:text-gray-400">Loading credentials...</span>
                          </div>
                        ) : (
                          <select
                            value={selectedCredId}
                            onChange={e => setSelectedCredId(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select existing admin credentials</option>
                            {existingCreds.map(cred => (
                              <option key={cred._id} value={cred._id}>{cred.adminUsername}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                    
                    {adminCredsError && (
                      <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-700 dark:text-red-300">{adminCredsError}</p>
                      </div>
                    )}
                    
                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={() => setShowAdminCredsModal(false)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors"
                        disabled={adminCredsLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                        disabled={adminCredsLoading || (adminCredsMode === 'existing' && !selectedCredId)}
                      >
                        {adminCredsLoading ? 'Assigning...' : 'Assign'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification Modal */}
        {showNotificationModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    Send Notification
                  </h2>
                  <button
                    onClick={() => setShowNotificationModal(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-medium">
                    <Mail className="h-4 w-4" />
                    Recipients: {selectedUsers.size} student(s)
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                    This notification will be sent to all selected students
                  </div>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); sendNotification(); }} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notification Title *
                    </label>
                    <input
                      type="text"
                      value={notificationTitle}
                      onChange={(e) => setNotificationTitle(e.target.value)}
                      placeholder="Enter notification title..."
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Message *
                    </label>
                    <textarea
                      value={notificationMessage}
                      onChange={(e) => setNotificationMessage(e.target.value)}
                      placeholder="Enter your message..."
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Priority Level
                    </label>
                    <select
                      value={notificationPriority}
                      onChange={(e) => setNotificationPriority(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="low">🟢 Low Priority</option>
                      <option value="normal">🟡 Normal Priority</option>
                      <option value="high">🟠 High Priority</option>
                      <option value="urgent">🔴 Urgent</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowNotificationModal(false)}
                      className="flex-1 px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors"
                      disabled={notificationLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                      disabled={notificationLoading || !notificationTitle.trim() || !notificationMessage.trim()}
                    >
                      {notificationLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send Notification
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsers;
