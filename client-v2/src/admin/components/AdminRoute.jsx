import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLogin from './AdminLogin.jsx';
import { checkAdminAuth } from '../utils/adminAuth';
import { Shield, Home, Loader2 } from 'lucide-react';
import { isAdminRole } from '../../utils/roles';

const AdminRoute = ({ children }) => {
  const { user, loading, requireAuth } = useAuth();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    // If not loading and no user, require authentication
    if (!loading && !user) {
      requireAuth();
      return;
    }

    // If user exists but not admin, redirect to home
    if (!loading && user && !isAdminRole(user.role)) {
      window.location.href = '/';
      return;
    }

    // If user is admin, check for dual authentication
    if (!loading && user && isAdminRole(user.role)) {
      const adminSession = sessionStorage.getItem('adminAuthenticated');
      if (adminSession === 'true') {
        // Verify session is still valid on server
        checkAdminAuth().then(isValid => {
          if (isValid) {
            setIsAdminAuthenticated(true);
          } else {
            // Server session expired, clear client session
            sessionStorage.removeItem('adminAuthenticated');
            setIsAdminAuthenticated(false);
            setShowAdminLogin(true);
          }
        });
      } else {
        setShowAdminLogin(true);
      }
    }
  }, [loading, user, requireAuth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20 dark:border-gray-700/30 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Show loading while redirecting to Google OAuth
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20 dark:border-gray-700/30 text-center max-w-md mx-4">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Redirecting to Google Sign-In
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Please wait while we redirect you to authentication...
          </p>
          <div className="flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-blue-600 dark:text-blue-400">Redirecting...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminRole(user.role)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-red-900/20 flex items-center justify-center">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20 dark:border-gray-700/30 text-center max-w-md mx-4">
          <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Access Denied
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            You don't have permission to access the admin panel.
          </p>
          <button 
            onClick={() => window.location.href = '/'} 
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <Home className="w-4 h-4 mr-2" />
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Show admin login for dual authentication
  if (showAdminLogin && !isAdminAuthenticated) {
    return (
      <AdminLogin 
        onAuthenticated={() => {
          setIsAdminAuthenticated(true);
          setShowAdminLogin(false);
          sessionStorage.setItem('adminAuthenticated', 'true');
        }}
      />
    );
  }

  // Show admin content if authenticated
  if (isAdminAuthenticated) {
    return children;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20 dark:border-gray-700/30 text-center max-w-md mx-4">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Authenticating Admin Access
        </h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Please wait while we verify your admin credentials...
        </p>
        <div className="flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-blue-600 dark:text-blue-400">Verifying...</span>
        </div>
      </div>
    </div>
  );
};

export default AdminRoute;
