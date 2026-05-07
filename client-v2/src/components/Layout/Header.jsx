import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { extractUserName } from '../../utils/avatar';
import { isAdminRole } from '../../utils/roles';
import Avatar from '../Avatar.jsx';
import NotificationBell from '../NotificationBell.jsx';
import { BookOpen, Sun, Moon, Plus, Bell, User, Menu, Home, FileText, Users, Info, Settings, Shield, LogOut, UserCircle, LogIn, LogInIcon, LogOutIcon, Loader, TrendingUp } from "lucide-react";
// import './Header.css';

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const userMenuRef = useRef(null);

  const displayName = user?.name ? extractUserName(user.name) : '';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = () => {
    navigate('/login');
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      setIsUserMenuOpen(false);
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isActiveLink = (path) => {
    return location.pathname === path;
  };

  const navLinks = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/experiences', label: 'Experiences', icon: FileText },
    { path: '/about', label: 'About', icon: Info },
  ];

  return (
    <header className="bg-card/95 backdrop-blur-md border-b border-border sticky top-0 z-50 shadow-lg transition-colors duration-300">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            {/* <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-2 rounded-xl shadow-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div> */}
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                InterviewShare
              </h1>
              <p className="text-xs text-muted-foreground">College Interview Experiences</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map(link => {
              const IconComponent = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center space-x-2 transition-colors group ${
                    isActiveLink(link.path) 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : 'text-foreground/70 hover:text-foreground'
                  }`}
                >
                  <IconComponent className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Actions */}
          <div className="flex items-center space-x-3">
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className="relative overflow-hidden hover:bg-secondary/80 transition-all duration-300 p-2 rounded-md"
            >
              <div className={`transition-all duration-300 ${theme === 'light' ? 'rotate-0 scale-100' : 'rotate-90 scale-0'} absolute`}>
                <Sun className="w-4 h-4" />
              </div>
              <div className={`transition-all duration-300 ${theme === 'dark' ? 'rotate-0 scale-100' : '-rotate-90 scale-0'} absolute`}>
                <Moon className="w-4 h-4" />
              </div>
              <div className="w-4 h-4 opacity-0"></div>
            </button>

            {isAuthenticated ? (
              <>
                {/* Share Experience Button */}
                {/* <Link 
                  to="/create"
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 flex items-center space-x-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 px-4 py-2 rounded-md"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Share Experience</span>
                  <span className="sm:hidden">Share</span>
                </Link> */}
                
                {/* Notification Bell */}
                <div className="hidden sm:block">
                  <NotificationBell/>
                </div>
                
                {/* User Menu */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    className="hover:bg-secondary/80 transition-all duration-200 flex items-center space-x-2 group p-2 rounded-lg hover:shadow-md"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110  transition-all duration-200">
                      <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="hidden sm:inline text-sm font-medium">{displayName}</span>
                    <div className={`transform transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : 'rotate-0'}`}>
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl py-2 z-50 animate-in slide-in-from-top-2 duration-200">
                      <div className="px-4 py-3 border-b border-border bg-muted/30 rounded-t-lg">
                        <div className="flex items-center space-x-2">
                          <div>
                            <div className="font-medium text-sm">{displayName}</div>
                            <div className="text-xs text-muted-foreground">{user?.email}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="py-1">
                        <Link 
                          to="/profile" 
                          className="flex items-center space-x-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors group"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <User className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                          <span>Profile</span>
                        </Link>
                        
                        {/* <Link 
                          to="/dashboard" 
                          className="flex items-center space-x-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors group"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <TrendingUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                          <span>Analytics</span>
                        </Link> */}
                        
                        <Link 
                          to="/settings" 
                          className="flex items-center space-x-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors group"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <Settings className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                          <span>Settings</span>
                        </Link>
                        
                        {isAdminRole(user?.role) && (
                          <Link 
                            to="/admin" 
                            className="flex items-center space-x-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 dark:text-blue-400 transition-colors group"
                            onClick={() => setIsUserMenuOpen(false)}
                          >
                            <Shield className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            <span>Admin Panel</span>
                          </Link>
                        )}
                      </div>
                      
                      <div className="border-t border-border my-1"></div>
                      
                      <button 
                        onClick={handleLogout} 
                        disabled={isLoggingOut}
                        className={`flex items-center space-x-3 w-full text-left px-4 py-2.5 text-sm transition-colors group ${
                          isLoggingOut 
                            ? 'bg-red-50 dark:bg-red-950/30 text-red-400 dark:text-red-500 cursor-not-allowed' 
                            : 'hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isLoggingOut ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <LogOutIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        )}
                        <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button 
                onClick={handleLogin} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-105 font-medium flex items-center space-x-2 group"
              >
                <LogInIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Login</span>
              </button>
            )}

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden hover:bg-secondary/80 transition-colors p-2 rounded-md"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 border-t border-border pt-4">
            <div className="space-y-2">
              {navLinks.map(link => {
                const IconComponent = link.icon;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                      isActiveLink(link.path) 
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400' 
                        : 'hover:bg-secondary'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
              
              {/* {isAuthenticated && (
                <Link
                  to="/create"
                  className="flex items-center space-x-2 px-4 py-2 rounded-md text-blue-600 dark:text-blue-400 hover:bg-secondary transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Plus className="w-4 h-4" />
                  <span>Share Experience</span>
                </Link>
              )} */}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
