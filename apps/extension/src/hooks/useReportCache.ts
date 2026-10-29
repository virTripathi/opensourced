import { useState, useEffect, useCallback, useMemo } from 'react';
import { isChromeExtension } from '../utils/platform';

export interface StoredReport {
  id: string;
  title: string;
  repo: string; // e.g. "facebook/react"
  issueNumber?: number;
  action: 'scan_issue' | 'owasp_check' | 'draft_pr' | string;
  content: string;
  streamLogs?: string[];
  createdAt: string; // ISO date string
  updatedAt?: string;
  driveUrl?: string | null;
  userId?: string;
}

const STORAGE_KEY = 'opensourced_cached_reports_v1';

export function useReportCache(apiBase?: string, getAuthHeaders?: (headers?: Record<string, string>) => Record<string, string>) {
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Initial Load from Local Cache (chrome.storage.local or localStorage)
  useEffect(() => {
    const loadCachedReports = async () => {
      try {
        if (isChromeExtension() && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_KEY], (res) => {
            if (res && res[STORAGE_KEY] && Array.isArray(res[STORAGE_KEY])) {
              setReports(res[STORAGE_KEY]);
            }
            setIsLoading(false);
          });
        } else if (typeof window !== 'undefined' && window.localStorage) {
          const item = window.localStorage.getItem(STORAGE_KEY);
          if (item) {
            setReports(JSON.parse(item));
          }
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Failed to load cached reports:', err);
        setIsLoading(false);
      }
    };

    loadCachedReports();
  }, []);

  // 2. Synchronize memory state to local storage
  const persistToLocalStorage = useCallback((updatedReports: StoredReport[]) => {
    try {
      if (isChromeExtension() && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: updatedReports });
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedReports));
      }
    } catch (err) {
      console.warn('Failed to persist reports to storage:', err);
    }
  }, []);

  // 3. Sync with backend API if authenticated
  const syncWithBackend = useCallback(async () => {
    if (!apiBase || !getAuthHeaders) return;

    try {
      const res = await fetch(`${apiBase}/api/reports`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (res.ok) {
        const backendReports = await res.json();
        if (Array.isArray(backendReports)) {
          setReports((prev) => {
            // Merge backend reports with local reports by ID
            const reportMap = new Map<string, StoredReport>();
            // Keep local reports first
            prev.forEach((r) => reportMap.set(r.id, r));
            // Add/update backend reports
            backendReports.forEach((br: any) => {
              reportMap.set(br.id, {
                id: br.id,
                title: br.title,
                repo: br.repo,
                action: br.action,
                content: br.content,
                createdAt: br.createdAt,
                updatedAt: br.updatedAt,
                userId: br.userId,
              });
            });

            const merged = Array.from(reportMap.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            persistToLocalStorage(merged);
            return merged;
          });
        }
      }
    } catch (err) {
      // Backend may be offline or user not logged in; local cache remains safe
      console.debug('Optional backend report sync skipped or failed:', err);
    }
  }, [apiBase, getAuthHeaders, persistToLocalStorage]);

  // 4. Save or Update Report
  const saveReport = useCallback(
    async (report: Omit<StoredReport, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<StoredReport> => {
      const id = report.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const createdAt = report.createdAt || new Date().toISOString();

      const newReport: StoredReport = {
        ...report,
        id,
        createdAt,
        updatedAt: new Date().toISOString(),
      };

      setReports((prev) => {
        // Replace if exists, or prepend
        const existingIdx = prev.findIndex((r) => r.id === id);
        let updated: StoredReport[];
        if (existingIdx >= 0) {
          updated = [...prev];
          updated[existingIdx] = newReport;
        } else {
          updated = [newReport, ...prev];
        }
        persistToLocalStorage(updated);
        return updated;
      });

      // Also persist to backend if online and credentials present
      if (apiBase && getAuthHeaders) {
        try {
          fetch(`${apiBase}/api/reports`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({
              title: newReport.title,
              repo: newReport.repo,
              action: newReport.action,
              content: newReport.content,
            }),
          }).catch(() => {
            // Background sync failure gracefully handled
          });
        } catch {}
      }

      return newReport;
    },
    [apiBase, getAuthHeaders, persistToLocalStorage]
  );

  // 5. Delete Report
  const deleteReport = useCallback(
    async (reportId: string): Promise<boolean> => {
      setReports((prev) => {
        const updated = prev.filter((r) => r.id !== reportId);
        persistToLocalStorage(updated);
        return updated;
      });

      if (apiBase && getAuthHeaders) {
        try {
          await fetch(`${apiBase}/api/reports/${reportId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            credentials: 'include',
          });
        } catch {}
      }

      return true;
    },
    [apiBase, getAuthHeaders, persistToLocalStorage]
  );

  // 6. Lookups for current context
  const getReportsForRepo = useCallback(
    (repoFullName: string, issueNumber?: number): StoredReport[] => {
      const normalizedRepo = repoFullName.toLowerCase().trim();
      return reports.filter((r) => {
        const matchesRepo = r.repo.toLowerCase().trim() === normalizedRepo;
        if (!matchesRepo) return false;
        if (issueNumber !== undefined && r.issueNumber !== undefined) {
          return r.issueNumber === issueNumber;
        }
        return true;
      });
    },
    [reports]
  );

  const getLatestReportForAction = useCallback(
    (repoFullName: string, actionType: string, issueNumber?: number): StoredReport | null => {
      const candidates = getReportsForRepo(repoFullName, issueNumber).filter(
        (r) => r.action === actionType
      );
      if (candidates.length === 0) return null;
      return candidates[0]; // Already sorted newest first
    },
    [getReportsForRepo]
  );

  return {
    reports,
    isLoading,
    saveReport,
    deleteReport,
    syncWithBackend,
    getReportsForRepo,
    getLatestReportForAction,
  };
}
