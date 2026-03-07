'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Settings, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useAppSettings, useAppConfig } from '@/components/providers/app-settings-provider';
import { usePreviewContextId } from '@/components/providers/marketplace';
import { useAuth } from '@/components/providers/auth';
import type { SiteSummary } from '@/lib/sitecore/sites';
import type { PageSummary, PageStatus } from '@/lib/sitecore/pages';
import type { ProcessPageResult } from '@/lib/sitecore/process-page';
import { VariantProps } from 'class-variance-authority';

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }: { status: PageStatus }) {
  const cfg: Record<PageStatus, { colorScheme: VariantProps<typeof Badge>['colorScheme']; icon: React.ReactNode; label: string }> = {
    pending:    { colorScheme: 'neutral',     icon: <Clock className="h-3 w-3" />,                    label: 'Pending'    },
    processed:  { colorScheme: 'success',     icon: <CheckCircle2 className="h-3 w-3" />,             label: 'Processed'  },
    error:      { colorScheme: 'danger', icon: <AlertCircle className="h-3 w-3" />,              label: 'Error'      },
  };
  const { colorScheme, icon, label } = cfg[status] ?? { colorScheme: 'outline', icon: null, label: status };
  return (
    <Badge variant='default' colorScheme={colorScheme} className="gap-1.5 font-medium">
      {icon}
      {label}
    </Badge>
  );
}



// ── Main extension ────────────────────────────────────────────────────────────

function StandaloneExtension() {
  const { setModalOpen } = useAppSettings();
  const { targetFieldName, metaFieldName } = useAppConfig();
  const sitecoreContextId = usePreviewContextId();
  const { getAccessTokenSilently } = useAuth();

  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId]
  );

  // Fetch sites on mount
  useEffect(() => {
    if (!sitecoreContextId) return;
    setLoadingSites(true);
    const run = async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch(`/api/sites?contextid=${sitecoreContextId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: SiteSummary[] = await res.json();
          setSites(data);
          if (data.length > 0) setSelectedSiteId(data[0].id);
        }
      } catch (e) {
        console.error('Failed to fetch sites', e);
      } finally {
        setLoadingSites(false);
      }
    };
    run();
  }, [sitecoreContextId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch pages when site changes
  useEffect(() => {
    if (!selectedSite || !sitecoreContextId) {
      setPages([]);
      return;
    }
    setLoadingPages(true);
    setPages([]);
    const run = async () => {
      try {
        const token = await getAccessTokenSilently();
        const params = new URLSearchParams({
          contextid: sitecoreContextId,
          site: selectedSite.name,
          targetField: targetFieldName,
          metaField: metaFieldName,
        });
        const res = await fetch(`/api/sites/${selectedSite.id}/pages?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setPages(await res.json());
      } catch (e) {
        console.error('Failed to fetch pages', e);
      } finally {
        setLoadingPages(false);
      }
    };
    run();
  }, [selectedSite, sitecoreContextId, targetFieldName, metaFieldName]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const processed = pages.filter((p) => p.status === 'processed').length;
    const errors = pages.filter((p) => p.status === 'error').length;
    return { total: pages.length, processed, errors, pending: pages.length - processed - errors };
  }, [pages]);

  const errorPages = useMemo(() => pages.filter((p) => p.status === 'error'), [pages]);

  const processOnePage = async (pageId: string) => {
    if (!sitecoreContextId || !selectedSite) return;
    setProcessingIds((prev) => new Set(prev).add(pageId));
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/pages/${encodeURIComponent(pageId)}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          contextId: sitecoreContextId,
          language: selectedSite.languages[0] ?? 'en',
          targetField: targetFieldName,
          metaField: metaFieldName,
        }),
      });
      if (res.ok) {
        const result: ProcessPageResult = await res.json();
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, status: 'processed', wordCount: result.wordCount, processedAt: result.processedAt }
              : p
          )
        );
      } else {
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, status: 'error' } : p))
        );
      }
    } catch {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, status: 'error' } : p))
      );
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(pageId);
        return next;
      });
    }
  };

  const [isBatching, setIsBatching] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const batchCancelRef = useRef(false);
  const progressPct = batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 0;

  const startBatch = async () => {
    if (!selectedSite || !sitecoreContextId) return;
    const pending = pages.filter((p) => p.status !== 'processed');
    if (pending.length === 0) return;

    batchCancelRef.current = false;
    setIsBatching(true);
    setBatchDone(0);
    setBatchTotal(pending.length);

    for (const page of pending) {
      if (batchCancelRef.current) break;
      await processOnePage(page.id);
      setBatchDone((n) => n + 1);
    }

    setIsBatching(false);
  };

  const cancelBatch = () => {
    batchCancelRef.current = true;
  };

  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto p-8 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AEO Helper</h1>
            {selectedSite && !loadingPages && (
              <p className="text-sm text-muted-foreground mt-1">
                {stats.total} pages ·{' '}
                <span className="text-emerald-600 font-medium">{stats.processed} processed</span>
                {' · '}
                {stats.pending} pending
                {stats.errors > 0 && (
                  <span className="text-destructive font-medium"> · {stats.errors} errors</span>
                )}
              </p>
            )}
          </div>
          <Button variant="outline" size="icon" aria-label="Settings" onClick={() => setModalOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Site:</span>
            <Select disabled={loadingSites} value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={loadingSites ? 'Loading…' : 'Select site'} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.displayName || site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            {isBatching && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{batchDone}</span>
                /{batchTotal} processed
              </p>
            )}
            <Button
              disabled={!selectedSite || loadingPages}
              variant={isBatching ? 'destructive' : 'default'}
              onClick={isBatching ? cancelBatch : startBatch}
            >
              {isBatching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancel</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" />Start Processing</>
              )}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {isBatching && (
          <div className="space-y-1">
            <Progress value={progressPct} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-right">{progressPct}%</p>
          </div>
        )}

        {/* Error alert */}
        {!isBatching && errorPages.length > 0 && (
          <Alert variant="danger">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {errorPages.length} page{errorPages.length > 1 ? 's' : ''} failed to process.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-destructive/30 hover:bg-destructive/10 ml-4"
              >
                Retry all
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Pages table */}
        {selectedSite && (
          <>
          <h2 className="text-base font-semibold">Convert to markdown</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Words</TableHead>
                  <TableHead>Last Processed</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPages ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading pages…
                    </TableCell>
                  </TableRow>
                ) : pages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No pages found
                    </TableCell>
                  </TableRow>
                ) : (
                  pages.map((page) => (
                    <TableRow key={page.id} className="group">
                      <TableCell className="font-medium">{page.displayName || page.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                          {page.url}
                        </code>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={page.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {page.wordCount ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(page.processedAt)}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              disabled={processingIds.has(page.id)}
                              onClick={() => processOnePage(page.id)}
                            >
                              {processingIds.has(page.id)
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {page.status === 'processed' ? 'Reprocess' : 'Process'} page
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export default StandaloneExtension;
