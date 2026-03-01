import React, { createContext, useContext, useState, useEffect } from 'react';
import { pb } from '@/api/marginbitesClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(pb.authStore.model);
  const [isAuthenticated, setIsAuthenticated] = useState(pb.authStore.isValid);

  useEffect(() => {
    // PocketBase fires onChange whenever the auth store changes (login/logout/token refresh)
    const unsubscribe = pb.authStore.onChange((token, model) => {
      setUser(model);
      setIsAuthenticated(pb.authStore.isValid);
    });
    return unsubscribe;
  }, []);

  const logout = () => {
    pb.authStore.clear();
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      logout,
      navigateToLogin: () => { window.location.href = '/login'; },
      checkAppState: () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
