'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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
import { RefreshCw, Settings, AlertCircle, CheckCircle2, Clock, Loader2, Ban, FileText } from 'lucide-react';
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
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) {
    const rem = mins - hours * 60;
    return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
  }
  const remH = hours - days * 24;
  return remH > 0 ? `${days}d ${remH}h ago` : `${days}d ago`;
}


function StatusBadge({ status }: { status: PageStatus }) {
  const cfg: Record<PageStatus, { colorScheme: VariantProps<typeof Badge>['colorScheme']; icon: React.ReactNode; label: string }> = {
    pending:           { colorScheme: 'neutral', icon: <Clock className="h-3 w-3" />,        label: 'Pending'       },
    processed:         { colorScheme: 'success', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Processed'     },
    error:             { colorScheme: 'danger',  icon: <AlertCircle className="h-3 w-3" />,  label: 'Error'         },
    version_not_found: { colorScheme: 'neutral', icon: <Ban className="h-3 w-3" />,          label: 'No version'    },
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
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
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
          if (data.length > 0) {
            setSelectedSiteId(data[0].id);
            setSelectedLanguage(data[0].languages[0] ?? 'en');
          }
        }
      } catch (e) {
        console.error('Failed to fetch sites', e);
      } finally {
        setLoadingSites(false);
      }
    };
    run();
  }, [sitecoreContextId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selected language valid when site changes
  useEffect(() => {
    if (!selectedSite) return;
    const langs = selectedSite.languages;
    if (!langs.includes(selectedLanguage)) {
      setSelectedLanguage(langs[0] ?? 'en');
    }
  }, [selectedSite]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch pages when site or language changes
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
          language: selectedLanguage,
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
  }, [selectedSite, selectedLanguage, sitecoreContextId, targetFieldName, metaFieldName]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const processed = pages.filter((p) => p.status === 'processed').length;
    const errors = pages.filter((p) => p.status === 'error').length;
    const noVersion = pages.filter((p) => p.status === 'version_not_found').length;
    return { total: pages.length, processed, errors, noVersion, pending: pages.length - processed - errors - noVersion };
  }, [pages]);

  const errorPages = useMemo(() => pages.filter((p) => p.status === 'error'), [pages]);

  // Set of URLs that are a prefix of at least one other page URL (= branch nodes)
  const parentUrls = useMemo(() => {
    const urls = pages.map((p) => p.url);
    return new Set(
      pages
        .filter((p) => {
          const prefix = p.url === '/' ? '/' : p.url + '/';
          return urls.some((u) => u !== p.url && u.startsWith(prefix));
        })
        .map((p) => p.url)
    );
  }, [pages]);

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
          language: selectedLanguage,
          targetField: targetFieldName,
          metaField: metaFieldName,
        }),
      });
      if (res.ok) {
        const result = await res.json() as ProcessPageResult & { status?: string };
        if (result.status === 'version_not_found') {
          setPages((prev) =>
            prev.map((p) => (p.id === pageId ? { ...p, status: 'version_not_found' } : p))
          );
        } else {
          setPages((prev) =>
            prev.map((p) =>
              p.id === pageId
                ? { ...p, status: 'processed', wordCount: result.wordCount, processedAt: result.processedAt }
                : p
            )
          );
        }
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
    const pending = pages.filter((p) => p.status !== 'version_not_found');
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

  const [isGeneratingLlm, setIsGeneratingLlm] = useState(false);

  const generateLlmTxt = async () => {
    if (!selectedSite || !sitecoreContextId) return;
    setIsGeneratingLlm(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/output/llms-txt?contextid=${sitecoreContextId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          siteName: selectedSite.name,
          siteId: selectedSite.id,
          targetField: targetFieldName,
          language: selectedLanguage,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.error || data.message || 'Failed to generate llms.txt');
      }
    } catch (e) {
      console.error('Failed to generate llms.txt', e);
      toast.error('An error occurred while generating llms.txt');
    } finally {
      setIsGeneratingLlm(false);
    }
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
                {stats.noVersion > 0 && (
                  <span className="font-medium"> · {stats.noVersion} no version</span>
                )}
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
          <div className="flex items-center gap-4">
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

            {selectedSite && selectedSite.languages.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Language:</span>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSite.languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isBatching && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{batchDone}</span>
                /{batchTotal} processed
              </p>
            )}
            <Button
              disabled={!selectedSite || loadingPages || isBatching || isGeneratingLlm}
              variant="outline"
              onClick={generateLlmTxt}
            >
              {isGeneratingLlm ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Generate LLM.TXT</>
              )}
            </Button>
            <Button
              disabled={!selectedSite || loadingPages || isGeneratingLlm}
              variant={isBatching ? 'destructive' : 'default'}
              onClick={isBatching ? cancelBatch : startBatch}
            >
              {isBatching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancel</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" />Generate</>
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
                <TableRow className="bg-muted/60 hover:bg-muted/60 border-b-2">
                  <TableHead className="font-semibold text-foreground">Name</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Words</TableHead>
                  <TableHead className="font-semibold text-foreground">Last Processed</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPages ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading pages…
                    </TableCell>
                  </TableRow>
                ) : pages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No pages found
                    </TableCell>
                  </TableRow>
                ) : (
                  pages.map((page) => {
                    const depth = page.url === '/' ? 0 : page.url.split('/').filter(Boolean).length;
                    const isParent = parentUrls.has(page.url);
                    return (
                    <TableRow key={page.id} className={`group${isParent ? ' bg-muted/30' : ''}`}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`block truncate max-w-xs${isParent ? ' font-semibold' : ' font-medium'}`}
                              style={{ paddingLeft: depth * 20 }}
                            >
                              {page.displayName || page.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <code className="text-xs font-mono">{page.url}</code>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={page.status} />
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
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
                  );})
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
