import React, { createContext, useContext } from 'react';

const AuthContext = createContext();

// Auth is stubbed — PocketBase collections use null rules (fully open).
// A real login system can be wired here later.
const STUB_USER = {
  full_name: 'Admin',
  email: 'admin@marginbites.com',
  role: 'admin',
};

export const AuthProvider = ({ children }) => (
  <AuthContext.Provider value={{
    user: STUB_USER,
    isAuthenticated: true,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: null,
    logout: () => {},
    navigateToLogin: () => {},
    checkAppState: () => {},
  }}>
    {children}
  </AuthContext.Provider>
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
