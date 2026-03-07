'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useAppSettings, useAppConfig } from '@/components/providers/app-settings-provider';
import { usePreviewContextId } from '@/components/providers/marketplace';
import { useAuth } from '@/components/providers/auth';
import type { SiteSummary } from '@/lib/sitecore/sites';
import type { PageSummary } from '@/lib/sitecore/pages';
import type { ProcessPageResult } from '@/lib/sitecore/process-page';

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

interface ProcessPageTestProps {
  contextId: string;
  language: string;
  targetField: string;
  metaField: string;
  getToken: () => Promise<string>;
}

function ProcessPageTest({ contextId, language, targetField, metaField, getToken }: ProcessPageTestProps) {
  const [itemId, setItemId] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessPageResult | { error: string } | null>(null);
  const resultRef = useRef<HTMLPreElement>(null);

  const handleProcess = async () => {
    if (!itemId.trim() || !contextId) return;
    setLoading(true);
    setResult(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      if (aiKey.trim()) headers['X-AI-Api-Key'] = aiKey.trim();

      const res = await fetch(`/api/pages/${encodeURIComponent(itemId.trim())}/process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contextId, language, targetField, metaField }),
      });
      setResult(await res.json());
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Test — Process single page
      </h2>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-1.5 text-sm font-mono bg-background"
          placeholder="Item ID (GUID)"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleProcess()}
        />
        <input
          className="w-64 border rounded px-3 py-1.5 text-sm font-mono bg-background"
          placeholder="AI API key (optional)"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
        />
        <Button size="sm" disabled={!itemId.trim() || !contextId || loading} onClick={handleProcess}>
          {loading ? 'Processing…' : 'Process'}
        </Button>
      </div>

      {result && (
        <pre
          ref={resultRef}
          className="text-xs bg-background border rounded p-3 overflow-auto max-h-72 whitespace-pre-wrap"
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

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
        if (res.ok) setSites(await res.json());
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
    return { total: pages.length, processed, pending: pages.length - processed };
  }, [pages]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AEO Helper</h1>
        <Button variant="outline" onClick={() => setModalOpen(true)}>
          Settings
        </Button>
      </div>

      {/* Site selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Site:</span>
        <Select
          disabled={loadingSites}
          value={selectedSiteId}
          onValueChange={setSelectedSiteId}
        >
          <SelectTrigger className="w-[260px]">
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

      {/* Stats bar */}
      {selectedSite && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {loadingPages ? (
            <span>Loading pages…</span>
          ) : (
            <>
              <span>{stats.total} pages</span>
              <span>·</span>
              <span className="text-success-fg">{stats.processed} processed</span>
              <span>·</span>
              <span>{stats.pending} pending</span>
            </>
          )}
        </div>
      )}

      {/* Pages table */}
      {selectedSite && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Words</TableHead>
              <TableHead>Last Processed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingPages ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading pages…
                </TableCell>
              </TableRow>
            ) : pages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No pages found
                </TableCell>
              </TableRow>
            ) : (
              pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-medium">
                    {page.displayName || page.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {page.url}
                  </TableCell>
                  <TableCell>
                    <Badge
                      colorScheme={page.status === 'processed' ? 'success' : 'neutral'}
                      size="sm"
                    >
                      {page.status === 'processed' ? '● Processed' : '○ Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {page.wordCount != null ? page.wordCount : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(page.processedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Start Processing */}
      <div className="flex justify-end">
        <Button
          disabled={!selectedSite || loadingPages}
          onClick={() => {
            console.log('Start processing site:', selectedSite?.name, `(${pages.length} pages)`);
            // TODO: wire to /api/jobs/start in next phase
          }}
        >
          Start Processing
        </Button>
      </div>

      {/* ── Test: Process single page ── */}
      <ProcessPageTest
        contextId={sitecoreContextId ?? ''}
        language={selectedSite?.languages[0] ?? 'en'}
        targetField={targetFieldName}
        metaField={metaFieldName}
        getToken={getAccessTokenSilently}
      />
    </div>
  );
}

export default StandaloneExtension;
