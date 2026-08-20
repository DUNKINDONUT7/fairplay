import React, { createContext, useMemo } from 'react';
import useNotificationStore from '../store/notificationStore';

export const NotificationContext = createContext();

// Notification Types
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

export const NotificationProvider = ({ children }) => {
  const store = useNotificationStore();

  const value = useMemo(() => ({
    notifications: store.notifications,
    addNotification: store.addNotification,
    removeNotification: store.removeNotification,
    clearAll: store.clearNotifications,
    success: store.success,
    error: store.error,
    warning: store.warning,
    info: store.info,
  }), [store]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
