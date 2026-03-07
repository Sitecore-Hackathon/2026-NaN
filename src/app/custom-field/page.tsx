'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Save, X, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMarketplaceClient, usePreviewContextId } from '@/components/providers/marketplace';
import { useAuth } from '@/components/providers/auth';
import { useAppConfig } from '@/components/providers/app-settings-provider';

// ---------------------------------------------------------------------------
// Word count helper
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Main field editor component
// ---------------------------------------------------------------------------

function AiMarkdownFieldEditor() {
  const client = useMarketplaceClient();
  const sitecoreContextId = usePreviewContextId();
  const { getAccessTokenSilently } = useAuth();
  const { targetFieldName, metaFieldName } = useAppConfig();

  // Current markdown value shown in the editor
  const [markdown, setMarkdown] = useState('');

  // Loading states
  const [loadingValue, setLoadingValue] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the current field value from the host on mount
  useEffect(() => {
    const load = async () => {
      try {
        const value = await client.getValue();
        setMarkdown(typeof value === 'string' ? value : '');
      } catch (e) {
        console.error('Failed to load field value', e);
      } finally {
        setLoadingValue(false);
      }
    };

    load();
  }, [client]);

  // Generate Markdown from page HTML via the process API
  const handleGenerate = useCallback(async () => {
    if (!sitecoreContextId) {
      toast.error('Sitecore context is not available');
      return;
    }

    setGenerating(true);
    try {
      // Retrieve the current page context (itemId + language)
      const pagesCtx = await client.query('pages.context');
      const itemId: string | undefined = pagesCtx?.data?.pageInfo?.id;
      const language: string = pagesCtx?.data?.pageInfo?.language ?? 'en';

      if (!itemId) {
        toast.error('Could not determine the current item ID. Make sure the field is open inside a page.');
        return;
      }

      const token = await getAccessTokenSilently();

      const res = await fetch(`/api/pages/${encodeURIComponent(itemId)}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contextId: sitecoreContextId,
          language,
          targetField: targetFieldName,
          metaField: metaFieldName,
          // Do not save to Sitecore here — the Save button calls client.setValue()
          // as the single write to avoid an "item already modified" conflict.
          saveToSitecore: false,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error ?? 'Generation failed');
      }

      const result = await res.json();
      setMarkdown(result.markdown ?? '');
      toast.success(`Generated ${result.wordCount ?? 0} words`);
    } catch (e) {
      console.error('Generation error', e);
      toast.error(e instanceof Error ? e.message : 'Failed to generate Markdown');
    } finally {
      setGenerating(false);
    }
  }, [client, sitecoreContextId, getAccessTokenSilently, targetFieldName, metaFieldName]);

  // Save the edited value back to the Sitecore field and close the dialog
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // canvasReload=true forces Pages editor to refresh the canvas after save
      await client.setValue(markdown, true);
      await client.closeApp();
    } catch (e) {
      console.error('Save error', e);
      toast.error('Failed to save the field value');
    } finally {
      setSaving(false);
    }
  }, [client, markdown]);

  // Close the dialog without saving
  const handleCancel = useCallback(async () => {
    try {
      await client.closeApp();
    } catch (e) {
      console.error('Close error', e);
    }
  }, [client]);

  // Show a spinner while the initial value is being fetched
  if (loadingValue) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const wordCount = countWords(markdown);
  const charCount = markdown.length;

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">AI Markdown Editor</h2>
        </div>

        {/* Generate button — calls the process API to generate Markdown from page HTML */}
        <Button
          size="sm"
          variant="outline"
          disabled={generating || !sitecoreContextId}
          onClick={handleGenerate}
          className="gap-1.5"
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {generating ? 'Generating…' : 'Generate from page'}
        </Button>
      </div>

      {/* ── Markdown textarea ── */}
      <textarea
        className="
          flex-1 min-h-[320px] w-full resize-none
          rounded-md border bg-background
          px-3 py-2 text-sm font-mono
          placeholder:text-muted-foreground
          focus:outline-none focus:ring-2 focus:ring-ring
          disabled:cursor-not-allowed disabled:opacity-50
        "
        placeholder="Markdown content…"
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        disabled={generating || saving}
        spellCheck={false}
      />

      {/* ── Footer: word/char count + action buttons ── */}
      <div className="flex items-center justify-between gap-3">
        {/* Stats */}
        <span className="text-xs text-muted-foreground">
          {wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount} {charCount === 1 ? 'char' : 'chars'}
        </span>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={saving || generating}
            onClick={handleCancel}
            className="gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </Button>

          <Button
            size="sm"
            disabled={saving || generating}
            onClick={handleSave}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AiMarkdownFieldEditor;
