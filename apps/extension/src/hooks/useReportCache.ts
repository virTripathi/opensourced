import { useState, useEffect, useCallback, useMemo } from 'react';
import { isChromeExtension } from '../utils/platform';

export interface ReportVersionSnapshot {
  version: number;
  createdAt: string;
  content: string;
  streamLogs?: string[];
}

export interface StoredReport {
  id: string;
  title: string;
  repo: string; // e.g. "facebook/react"
  issueNumber?: number;
  action: 'scan_issue' | 'owasp_check' | 'draft_pr' | 'summarise' | 'summarise_feature' | string;
  query?: string;
  content: string;
  streamLogs?: string[];
  createdAt: string; // ISO date string
  updatedAt?: string;
  driveUrl?: string | null;
  userId?: string;
  version?: number;
  isLatest?: boolean;
  branch?: string;
  previousVersions?: ReportVersionSnapshot[];
}

export interface SaveReportOptions {
  replaceExisting?: boolean;
}

const STORAGE_KEY = 'opensourced_cached_reports_v1';

/**
 * Normalizes loaded reports to ensure every report has a version number
 * and the latest report in each scope is flagged with isLatest = true.
 */
function normalizeReportVersions(rawReports: StoredReport[]): StoredReport[] {
  if (!Array.isArray(rawReports) || rawReports.length === 0) return [];

  const groups = new Map<string, StoredReport[]>();
  rawReports.forEach((rep) => {
    const scopeKey = `${rep.repo.toLowerCase().trim()}::${rep.action}::${rep.issueNumber || ''}::${(rep.query || '').trim()}`;
    if (!groups.has(scopeKey)) {
      groups.set(scopeKey, []);
    }
    groups.get(scopeKey)!.push(rep);
  });

  const normalized: StoredReport[] = [];
  groups.forEach((group) => {
    // Sort chronological: oldest first to assign sequential v1, v2 if missing
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    group.forEach((item, idx) => {
      const isLatest = idx === group.length - 1;
      normalized.push({
        ...item,
        version: item.version ?? (idx + 1),
        isLatest: item.isLatest !== undefined ? (isLatest ? true : item.isLatest) : isLatest,
      });
    });
  });

  // Sort overall newest first by updatedAt / createdAt
  return normalized.sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt).getTime();
    return timeB - timeA;
  });
}

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
              const normalized = normalizeReportVersions(res[STORAGE_KEY]);
              setReports(normalized);
            }
            setIsLoading(false);
          });
        } else if (typeof window !== 'undefined' && window.localStorage) {
          const item = window.localStorage.getItem(STORAGE_KEY);
          if (item) {
            const normalized = normalizeReportVersions(JSON.parse(item));
            setReports(normalized);
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
            const reportMap = new Map<string, StoredReport>();
            prev.forEach((r) => reportMap.set(r.id, r));
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
                version: br.version || 1,
                isLatest: br.isLatest ?? true,
              });
            });

            const merged = normalizeReportVersions(Array.from(reportMap.values()));
            persistToLocalStorage(merged);
            return merged;
          });
        }
      }
    } catch (err) {
      console.debug('Optional backend report sync skipped or failed:', err);
    }
  }, [apiBase, getAuthHeaders, persistToLocalStorage]);

  // 4. Save or Update Report with Versioning & Replacement
  const saveReport = useCallback(
    async (
      report: Omit<StoredReport, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
      options: SaveReportOptions = { replaceExisting: true }
    ): Promise<StoredReport> => {
      const replaceExisting = options.replaceExisting ?? true;
      const normalizedRepo = report.repo.toLowerCase().trim();
      const normalizedQuery = (report.query || '').trim();

      let savedReport: StoredReport;

      setReports((prev) => {
        // Find existing reports for the identical target scope
        const matchingIdx = prev.findIndex((r) => {
          const matchesRepo = r.repo.toLowerCase().trim() === normalizedRepo;
          const matchesAction = r.action === report.action;
          const matchesIssue = (r.issueNumber || undefined) === (report.issueNumber || undefined);
          const matchesQuery = (r.query || '').trim() === normalizedQuery;
          return matchesRepo && matchesAction && matchesIssue && matchesQuery;
        });

        if (matchingIdx >= 0 && replaceExisting) {
          // Replacement strategy: Keep the report slot, bump version, and archive prior snapshot
          const existing = prev[matchingIdx];
          const nextVersion = (existing.version || 1) + 1;
          const priorSnapshots: ReportVersionSnapshot[] = [
            ...(existing.previousVersions || []),
            {
              version: existing.version || 1,
              createdAt: existing.updatedAt || existing.createdAt,
              content: existing.content,
              streamLogs: existing.streamLogs,
            },
          ];

          savedReport = {
            ...existing,
            ...report,
            id: existing.id,
            createdAt: existing.createdAt, // Preserve original root generation time
            updatedAt: new Date().toISOString(),
            version: nextVersion,
            isLatest: true,
            previousVersions: priorSnapshots,
          };

          const updated = [...prev];
          updated[matchingIdx] = savedReport;

          // Re-sort so updated report bubbles to top
          const sorted = updated.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAt).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt).getTime();
            return timeB - timeA;
          });

          persistToLocalStorage(sorted);
          return sorted;
        } else {
          // Versioned Append strategy: Create new report item, compute sequential version
          const id = report.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const createdAt = report.createdAt || new Date().toISOString();

          const matchingReports = prev.filter((r) => {
            const matchesRepo = r.repo.toLowerCase().trim() === normalizedRepo;
            const matchesAction = r.action === report.action;
            const matchesIssue = (r.issueNumber || undefined) === (report.issueNumber || undefined);
            const matchesQuery = (r.query || '').trim() === normalizedQuery;
            return matchesRepo && matchesAction && matchesIssue && matchesQuery;
          });

          const maxVersion = matchingReports.reduce((max, r) => Math.max(max, r.version || 1), 0);
          const nextVersion = maxVersion > 0 ? maxVersion + 1 : 1;

          savedReport = {
            ...report,
            id,
            createdAt,
            updatedAt: new Date().toISOString(),
            version: nextVersion,
            isLatest: true,
            previousVersions: report.previousVersions || [],
          };

          // Mark previous matching versions as not latest
          const updated = prev.map((r) => {
            const matchesRepo = r.repo.toLowerCase().trim() === normalizedRepo;
            const matchesAction = r.action === report.action;
            const matchesIssue = (r.issueNumber || undefined) === (report.issueNumber || undefined);
            const matchesQuery = (r.query || '').trim() === normalizedQuery;
            if (matchesRepo && matchesAction && matchesIssue && matchesQuery) {
              return { ...r, isLatest: false };
            }
            return r;
          });

          const result = [savedReport, ...updated];
          persistToLocalStorage(result);
          return result;
        }
      });

      // Synchronize with backend if configured
      if (apiBase && getAuthHeaders && savedReport!) {
        try {
          fetch(`${apiBase}/api/reports`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({
              title: savedReport.title,
              repo: savedReport.repo,
              action: savedReport.action,
              content: savedReport.content,
            }),
          }).catch(() => {});
        } catch {}
      }

      return savedReport!;
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

      // Prefer isLatest, then highest version, then most recent timestamp
      candidates.sort((a, b) => {
        if (a.isLatest && !b.isLatest) return -1;
        if (!a.isLatest && b.isLatest) return 1;
        const vA = a.version || 1;
        const vB = b.version || 1;
        if (vB !== vA) return vB - vA;
        const timeA = new Date(a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      });

      return candidates[0];
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
