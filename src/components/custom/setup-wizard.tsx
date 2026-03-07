'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from 'lucide-react';
import { useAppContext, useMarketplaceClient } from '@/components/providers/marketplace';
import { useAppConfig } from '@/components/providers/app-settings-provider';
import {
  checkPageTemplateFields,
  checkSiteSettingsField,
  addFieldsToTemplate,
} from '@/lib/sitecore/setup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus =
  | 'checking'
  | 'needed'
  | 'already_done'
  | 'running'
  | 'success'
  | 'skipped'
  | 'error'
  | 'permission_denied';

interface CheckData {
  templateId?: string | null;
  templateName?: string | null;
  settingsTemplateId?: string | null;
  llmFieldName?: string;
}

export interface SetupWizardProps {
  siteId: string;
  contextId: string;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function StatusBadge({ status, error }: { status: StepStatus; error?: string }) {
  if (status === 'checking') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking…
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-blue-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Running…
      </span>
    );
  }
  if (status === 'already_done' || status === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {status === 'success' ? 'Done' : 'Already configured'}
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MinusCircle className="h-3.5 w-3.5" />
        Skipped
      </span>
    );
  }
  if (status === 'needed') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
        <AlertCircle className="h-3.5 w-3.5" />
        Required
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        {error ?? 'Error'}
      </span>
    );
  }
  if (status === 'permission_denied') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600">
        <AlertCircle className="h-3.5 w-3.5" />
        Insufficient permissions
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Manual instructions (permission denied)
// ---------------------------------------------------------------------------

function ManualInstructions({
  isPageStep,
  checkData,
  pageFields,
  onSkip,
  onRetry,
}: {
  isPageStep: boolean;
  checkData: CheckData;
  pageFields: Array<{ name: string; type: string }>;
  onSkip: () => void;
  onRetry: () => void;
}) {
  const templateId = isPageStep ? checkData.templateId : checkData.settingsTemplateId;
  const templateName = isPageStep ? checkData.templateName : null;

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm space-y-2">
      <p className="text-amber-800 dark:text-amber-300 text-xs">
        Template Manager role required to add fields automatically. Follow these manual steps instead:
      </p>
      <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground pl-1">
        <li>Open Content Editor in Sitecore</li>
        {templateId && (
          <li>
            Navigate to template:{' '}
            {templateName && <span className="font-medium">{templateName} — </span>}
            <code className="bg-muted px-1 py-0.5 rounded">{templateId}</code>
          </li>
        )}
        <li>
          Add a section <code className="bg-muted px-1 py-0.5 rounded">LLMify</code>
        </li>
        {isPageStep ? (
          pageFields.map((f) => (
            <li key={f.name}>
              Add field <code className="bg-muted px-1 py-0.5 rounded">{f.name}</code>{' '}
              ({f.type})
            </li>
          ))
        ) : (
          <li>
            Add field <code className="bg-muted px-1 py-0.5 rounded">{checkData.llmFieldName}</code>{' '}
            (Multi-Line Text)
          </li>
        )}
      </ol>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onSkip}>
          Skip this step
        </Button>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step card
// ---------------------------------------------------------------------------

interface StepCardProps {
  title: string;
  description: string;
  status: StepStatus;
  error?: string;
  isPageStep: boolean;
  pageFields: Array<{ name: string; type: string }>;
  checkData: CheckData;
  canDo: boolean;
  onDo: () => void;
  onSkip: () => void;
  onRetry: () => void;
}

function StepCard({
  title,
  description,
  status,
  error,
  isPageStep,
  pageFields,
  checkData,
  canDo,
  onDo,
  onSkip,
  onRetry,
}: StepCardProps) {
  const showActions = status === 'needed' || status === 'error';
  const showPermissionDenied = status === 'permission_denied';

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-snug">{title}</p>
          <div className="shrink-0 pt-0.5">
            <StatusBadge status={status} error={error} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {showActions && (
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onSkip}>
            Skip
          </Button>
          {canDo && (
            <Button size="sm" onClick={onDo}>
              Do
            </Button>
          )}
        </div>
      )}

      {showPermissionDenied && (
        <ManualInstructions
          isPageStep={isPageStep}
          pageFields={pageFields}
          checkData={checkData}
          onSkip={onSkip}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function SetupWizardDialog({ siteId, contextId, onComplete }: SetupWizardProps) {
  const client = useMarketplaceClient();
  const { targetFieldName, metaFieldName, llmFieldName } = useAppConfig();
  const appContext = useAppContext();
  const pageFields: Array<{ name: string; type: string, source?: string }> = [
    { name: targetFieldName, type: 'Plugin', source: appContext.id ?? '' },
    { name: metaFieldName, type: 'Single-Line Text' },
  ];

  const [step1, setStep1] = useState<StepStatus>('checking');
  const [step2, setStep2] = useState<StepStatus>('checking');
  const [step1Error, setStep1Error] = useState<string | undefined>();
  const [step2Error, setStep2Error] = useState<string | undefined>();
  const [checkData, setCheckData] = useState<CheckData>({ llmFieldName });

  // Run checks on mount
  useEffect(() => {
    async function runChecks() {
      console.log('[SETUP] run checks');
      const [pageCheck, settingsCheck] = await Promise.allSettled([
        checkPageTemplateFields(client, contextId, siteId, pageFields.map((f) => f.name)),
        checkSiteSettingsField(client, contextId, siteId, llmFieldName),
      ]);

      if (pageCheck.status === 'fulfilled') {
        const r = pageCheck.value;
        setCheckData((prev) => ({ ...prev, templateId: r.templateId, templateName: r.templateName }));
        if (!r.checked) {
          setStep1('error');
          setStep1Error('Could not detect page template — no pages found at standard paths.');
        } else if (r.missingFields.length === 0) {
          setStep1('already_done');
        } else {
          setStep1('needed');
        }
      } else {
        setStep1('error');
        setStep1Error(String(pageCheck.reason));
      }

      if (settingsCheck.status === 'fulfilled') {
        const r = settingsCheck.value;
        setCheckData((prev) => ({ ...prev, settingsTemplateId: r.settingsTemplateId }));
        if (!r.checked) {
          setStep2('error');
          setStep2Error('Could not find site settings item at standard paths.');
        } else if (r.hasField) {
          setStep2('already_done');
        } else {
          setStep2('needed');
        }
      } else {
        setStep2('error');
        setStep2Error(String(settingsCheck.reason));
      }
    }
    runChecks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step runners
  const runStep1 = useCallback(async (): Promise<StepStatus> => {
    if (!checkData.templateId) {
      setStep1('error');
      setStep1Error('Template ID not available');
      return 'error';
    }
    setStep1('running');
    setStep1Error(undefined);
    const result = await addFieldsToTemplate(client, contextId, checkData.templateId, 'LLMify', pageFields);
    if (result.permissionDenied) {
      setStep1('permission_denied');
      setStep1Error(result.error);
      return 'permission_denied';
    }
    if (!result.success) {
      setStep1('error');
      setStep1Error(result.error);
      return 'error';
    }
    setStep1('success');
    return 'success';
  }, [client, contextId, checkData.templateId]);

  const runStep2 = useCallback(async (): Promise<StepStatus> => {
    if (!checkData.settingsTemplateId) {
      setStep2('error');
      setStep2Error('Settings template ID not available');
      return 'error';
    }
    setStep2('running');
    setStep2Error(undefined);
    const result = await addFieldsToTemplate(
      client,
      contextId,
      checkData.settingsTemplateId,
      'LLMify',
      [{ name: llmFieldName, type: 'Multi-Line Text' }]
    );
    if (result.permissionDenied) {
      setStep2('permission_denied');
      setStep2Error(result.error);
      return 'permission_denied';
    }
    if (!result.success) {
      setStep2('error');
      setStep2Error(result.error);
      return 'error';
    }
    setStep2('success');
    return 'success';
  }, [client, contextId, checkData.settingsTemplateId]);

  const runAll = useCallback(async () => {
    const shouldRun1 = step1 === 'needed';
    const shouldRun2 = step2 === 'needed';
    if (shouldRun1) {
      const s1 = await runStep1();
      if (s1 === 'permission_denied') return; // pause for user
    }
    if (shouldRun2) await runStep2();
  }, [step1, step2, runStep1, runStep2]);

  // Derived state
  const isChecking = step1 === 'checking' || step2 === 'checking';
  const anyRunning = step1 === 'running' || step2 === 'running';
  const allSettled = [step1, step2].every((s) =>
    ['already_done', 'success', 'skipped', 'error', 'permission_denied'].includes(s)
  );
  const neededCount = [step1, step2].filter((s) => s === 'needed').length;

  return (
    <Dialog open onOpenChange={(open) => !open && onComplete()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>LLMify Setup</DialogTitle>
          <DialogDescription>
            One-time configuration to prepare your site&apos;s templates for AEO content generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <StepCard
            title={`Extend page template with ${pageFields.map((f) => f.name).join(' & ')} fields`}
            description={`Adds ${pageFields.map((f) => `${f.name} (${f.type})`).join(' and ')} to your page template so AEO-generated content can be saved back to Sitecore items.`}
            status={step1}
            error={step1Error}
            isPageStep
            pageFields={pageFields}
            checkData={checkData}
            canDo={!!checkData.templateId}
            onDo={runStep1}
            onSkip={() => { setStep1('skipped'); setStep1Error(undefined); }}
            onRetry={runStep1}
          />
          <StepCard
            title="Extend site settings with LLM.txt field"
            description={`Adds ${llmFieldName} (Multi-Line Text) to your site settings template for storing generated llm.txt content.`}
            status={step2}
            error={step2Error}
            isPageStep={false}
            pageFields={pageFields}
            checkData={checkData}
            canDo={!!checkData.settingsTemplateId}
            onDo={runStep2}
            onSkip={() => { setStep2('skipped'); setStep2Error(undefined); }}
            onRetry={runStep2}
          />
        </div>

        <DialogFooter className="gap-2">
          {anyRunning ? (
            <Button size="sm" disabled>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Running…
            </Button>
          ) : allSettled ? (
            <Button size="sm" onClick={onComplete}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onComplete}>
                Skip all
              </Button>
              {neededCount > 0 && !isChecking && (
                <Button size="sm" onClick={runAll}>
                  One-click Setup
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
