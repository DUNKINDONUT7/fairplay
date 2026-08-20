// Mock Notifications Data

export const mockNotifications = [
  {
    id: 1,
    userId: 4,
    type: 'info',
    title: 'Event Registration Confirmed',
    message: 'You have successfully registered for Web Development Championship 2024',
    timestamp: '2024-06-10T10:30:00',
    read: false,
    icon: 'check-circle'
  },
  {
    id: 2,
    userId: 4,
    type: 'info',
    title: 'Event Starting Soon',
    message: 'Web Development Championship 2024 starts in 5 days',
    timestamp: '2024-06-10T09:15:00',
    read: false,
    icon: 'calendar'
  },
  {
    id: 3,
    userId: 4,
    type: 'warning',
    title: 'Registration Deadline Approaching',
    message: 'Registration for Coding Marathon 2024 closes in 2 days',
    timestamp: '2024-06-09T14:20:00',
    read: true,
    icon: 'alert-triangle'
  },
  {
    id: 4,
    userId: 4,
    type: 'success',
    title: 'Score Published',
    message: 'Your scores for National Debate Championship have been published',
    timestamp: '2024-06-08T16:45:00',
    read: true,
    icon: 'award'
  },
  {
    id: 5,
    userId: 4,
    type: 'info',
    title: 'Judge Assigned',
    message: 'Judge Michael Chen has been assigned to your event',
    timestamp: '2024-06-07T11:30:00',
    read: true,
    icon: 'user'
  },
  {
    id: 6,
    userId: 2,
    type: 'info',
    title: 'New Participant Registered',
    message: '10 new participants registered for your event',
    timestamp: '2024-06-10T13:00:00',
    read: false,
    icon: 'users'
  },
  {
    id: 7,
    userId: 2,
    type: 'success',
    title: 'Event Published',
    message: 'Your event Web Development Championship 2024 is now live',
    timestamp: '2024-06-05T09:00:00',
    read: true,
    icon: 'check'
  },
  {
    id: 8,
    userId: 3,
    type: 'info',
    title: 'Scoring Request',
    message: 'You have been assigned to score 5 participants in Contest Event',
    timestamp: '2024-06-10T10:00:00',
    read: false,
    icon: 'edit'
  }
];

// Get notifications for user
export const getNotificationsByUser = (userId) => {
  return mockNotifications
    .filter((notif) => notif.userId === userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

// Get unread notifications
export const getUnreadNotifications = (userId) => {
  return getNotificationsByUser(userId).filter((notif) => !notif.read);
};

// Get unread count
export const getUnreadCount = (userId) => {
  return getUnreadNotifications(userId).length;
};

// Mark as read
export const markAsRead = (notificationId) => {
  const notif = mockNotifications.find((n) => n.id === notificationId);
  if (notif) {
    notif.read = true;
  }
  return notif;
};

// Mark all as read for user
export const markAllAsRead = (userId) => {
  mockNotifications.forEach((notif) => {
    if (notif.userId === userId) {
      notif.read = true;
    }
  });
};

// Add notification (for mocking new notifications)
export const addNotification = (notification) => {
  const newId = Math.max(...mockNotifications.map((n) => n.id)) + 1;
  const newNotification = {
    ...notification,
    id: newId,
    timestamp: new Date().toISOString(),
    read: false
  };
  mockNotifications.unshift(newNotification);
  return newNotification;
};

// Delete notification
export const deleteNotification = (notificationId) => {
  const index = mockNotifications.findIndex((n) => n.id === notificationId);
  if (index > -1) {
    mockNotifications.splice(index, 1);
    return true;
  }
  return false;
};
