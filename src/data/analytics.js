// Mock Analytics and Metrics Data

export const mockAnalytics = {
  // Dashboard Overview
  overview: {
    totalEvents: 6,
    activeEvents: 2,
    completedEvents: 1,
    upcomingEvents: 3,
    totalParticipants: 342,
    totalTeams: 24,
    totalJudges: 8,
    totalOrganizers: 4
  },

  // Event Analytics
  eventAnalytics: {
    participantGrowth: [
      { date: 'Jan', count: 45 },
      { date: 'Feb', count: 62 },
      { date: 'Mar', count: 78 },
      { date: 'Apr', count: 95 },
      { date: 'May', count: 118 },
      { date: 'Jun', count: 156 },
      { date: 'Jul', count: 189 },
      { date: 'Aug', count: 234 },
      { date: 'Sep', count: 287 },
      { date: 'Oct', count: 342 }
    ],
    eventTypeDistribution: [
      { type: 'Contest', count: 2, percentage: 33.3 },
      { type: 'Tournament', count: 3, percentage: 50 },
      { type: 'Pageant', count: 1, percentage: 16.7 }
    ],
    categoryDistribution: [
      { category: 'Tech', count: 2, percentage: 33.3 },
      { category: 'Esports', count: 1, percentage: 16.7 },
      { category: 'Sports', count: 1, percentage: 16.7 },
      { category: 'Academic', count: 1, percentage: 16.7 },
      { category: 'Pageant', count: 1, percentage: 16.7 }
    ]
  },

  // User Analytics
  userAnalytics: {
    usersByRole: [
      { role: 'Participant', count: 287, percentage: 84 },
      { role: 'Organizer', count: 4, percentage: 1.2 },
      { role: 'Judge', count: 8, percentage: 2.3 },
      { role: 'Admin', count: 1, percentage: 0.3 }
    ],
    userGrowth: [
      { month: 'Jan', participants: 12, judges: 1, organizers: 1 },
      { month: 'Feb', participants: 28, judges: 2, organizers: 2 },
      { month: 'Mar', participants: 45, judges: 3, organizers: 2 },
      { month: 'Apr', participants: 68, judges: 4, organizers: 3 },
      { month: 'May', participants: 95, judges: 5, organizers: 3 },
      { month: 'Jun', participants: 128, judges: 6, organizers: 4 },
      { month: 'Jul', participants: 165, judges: 7, organizers: 4 },
      { month: 'Aug', participants: 205, judges: 8, organizers: 4 },
      { month: 'Sep', participants: 245, judges: 8, organizers: 4 },
      { month: 'Oct', participants: 287, judges: 8, organizers: 4 }
    ]
  },

  // Performance Metrics
  performanceMetrics: {
    averageParticipationRate: 78.5,
    averageCompletionRate: 82.3,
    averageJudgeRating: 4.6,
    averageEventRating: 4.4,
    totalRegistrations: 456,
    totalCompleted: 345,
    dropoutRate: 18.2
  },

  // Recent Activities
  recentActivities: [
    {
      id: 1,
      action: 'Event Created',
      description: 'Coding Marathon 2024 was created',
      timestamp: '2024-06-10T14:30:00',
      user: 'Sarah Johnson',
      icon: 'plus'
    },
    {
      id: 2,
      action: 'Participant Registered',
      description: '5 new participants registered for Web Development Championship',
      timestamp: '2024-06-10T13:15:00',
      user: 'System',
      icon: 'user-plus'
    },
    {
      id: 3,
      action: 'Scores Published',
      description: 'Scores published for National Debate Championship',
      timestamp: '2024-06-10T12:00:00',
      user: 'Judge Michael Chen',
      icon: 'award'
    },
    {
      id: 4,
      action: 'Match Completed',
      description: 'Match 7 completed in Esports Tournament',
      timestamp: '2024-06-10T11:30:00',
      user: 'System',
      icon: 'check'
    },
    {
      id: 5,
      action: 'Judge Assigned',
      description: 'Judge User assigned to Coding Marathon 2024',
      timestamp: '2024-06-10T10:45:00',
      user: 'Sarah Johnson',
      icon: 'user-check'
    }
  ]
};

// Get analytics overview
export const getAnalyticsOverview = () => {
  return mockAnalytics.overview;
};

// Get event analytics
export const getEventAnalytics = () => {
  return mockAnalytics.eventAnalytics;
};

// Get user analytics
export const getUserAnalytics = () => {
  return mockAnalytics.userAnalytics;
};

// Get performance metrics
export const getPerformanceMetrics = () => {
  return mockAnalytics.performanceMetrics;
};

// Get recent activities
export const getRecentActivities = (limit = 5) => {
  return mockAnalytics.recentActivities.slice(0, limit);
};
