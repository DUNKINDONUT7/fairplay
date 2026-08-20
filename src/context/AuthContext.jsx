import React, { createContext, useMemo } from 'react';
import useAuthStore from '../store/authStore';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const {
    user,
    token,
    loading,
    login,
    register,
    logout,
  } = useAuthStore();

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: !!token && !!user,
      userRole: user?.role || null,
      login,
      register,
      logout,
    }),
    [user, token, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
