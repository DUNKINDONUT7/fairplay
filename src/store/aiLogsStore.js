import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const initialStats = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  fallbackCount: 0,
  averageResponseTime: 0,
  lastModelUsed: 'n/a',
  promptCount: 0,
  tokenUsageEstimate: 0,
};

const useAILogsStore = create(
  persist(
    (set, get) => ({
      logs: [],
      stats: initialStats,

      addLog: (logEntry) => {
        set((state) => {
          const updated = [logEntry, ...state.logs.slice(0, 99)];
          const stats = calculateStats(updated);
          return { logs: updated, stats };
        });
      },

      getLogs: (filter = {}) => {
        const { logs } = get();
        let filtered = logs;

        if (filter.source) {
          filtered = filtered.filter((log) => log.source === filter.source);
        }
        if (filter.success !== undefined) {
          filtered = filtered.filter((log) => log.success === filter.success);
        }
        if (filter.eventType) {
          filtered = filtered.filter((log) => log.eventType === filter.eventType);
        }
        if (filter.startDate) {
          const start = new Date(filter.startDate).getTime();
          filtered = filtered.filter((log) => new Date(log.timestamp).getTime() >= start);
        }

        return filtered;
      },

      getStats: () => get().stats,

      clearLogs: () => set({ logs: [], stats: initialStats }),

      exportLogs: () => JSON.stringify(get().logs, null, 2),
    }),
    {
      name: 'fairplay_ai_logs',
      partialize: (state) => ({ logs: state.logs, stats: state.stats }),
    }
  )
);

function calculateStats(logs) {
  if (logs.length === 0) {
    return initialStats;
  }

  const successCount = logs.filter((log) => log.success).length;
  const failureCount = logs.filter((log) => !log.success).length;
  const fallbackCount = logs.filter((log) => log.source === 'fallback').length;
  const avgTime = logs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / logs.length;

  return {
    totalRequests: logs.length,
    successCount,
    failureCount,
    fallbackCount,
    averageResponseTime: Math.round(avgTime),
    lastModelUsed: logs[0]?.modelUsed || 'n/a',
    promptCount: logs.filter((log) => Boolean(log.promptPreview)).length,
    tokenUsageEstimate: logs.reduce((sum, log) => sum + Number(log.tokenUsageEstimate || 0), 0),
  };
}

export default useAILogsStore;
export { useAILogsStore };
