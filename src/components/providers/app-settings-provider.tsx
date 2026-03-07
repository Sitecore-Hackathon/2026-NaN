'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  useAppContext,
  useMarketplaceClient,
} from '@/components/providers/marketplace';
import {
  appConfigJsonStoreConfig,
  createJsonStore,
  createKVStore,
  setupFlagStoreConfig,
} from '@/lib/sitecore/storage/api-key-storage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppConfig {
  /** Field name to write AEO markdown to (e.g. "AiMarkdown") */
  targetFieldName: string;
  /** Field name to write JSON metadata to (e.g. "AiMarkdownMeta") */
  metaFieldName: string;
  /** Field name on the site settings template for llm.txt content (e.g. "AiLlmTxt") */
  llmFieldName: string;
  vercelAiGatewayApiKey: string;
}

const defaultConfig: AppConfig = {
  targetFieldName: 'AiMarkdown',
  metaFieldName: 'AiMarkdownMeta',
  llmFieldName: 'LLM',
  vercelAiGatewayApiKey: '',
};

interface AppSettingsContextType {
  config: AppConfig;
  setModalOpen: (open: boolean) => void;
  saveSettings: (newConfig: AppConfig) => Promise<void>;
  needsSetup: boolean;
  setNeedsSetup: (value: boolean) => void;
  markSetupComplete: () => Promise<void>;
  wizardReady: boolean;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(
  undefined
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AppSettingsProviderProps {
  children: React.ReactNode;
}

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
  const client = useMarketplaceClient();
  const appContext = useAppContext();
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [wizardReady, setWizardReady] = useState(false);

  const sitecoreContextId = appContext?.resourceAccess?.[0]?.context?.preview;

  useEffect(() => {
    if (!sitecoreContextId) return;

    const store = createJsonStore<AppConfig>(client, sitecoreContextId, appConfigJsonStoreConfig);
    store.get().then((saved) => {
      if (saved) setConfig({ ...defaultConfig, ...saved });
    });

    const setupStore = createKVStore(client, sitecoreContextId, setupFlagStoreConfig);
    setupStore.get('setup_complete').then((flag) => {
      if (flag !== 'true') setNeedsSetup(true);
    }).catch(() => {
      // don't block dashboard if flag read fails
    });
  }, [sitecoreContextId, client]);

  // When setup is needed for the first time, auto-open settings so the user
  // configures fields/API key before the setup wizard runs.
  useEffect(() => {
    if (needsSetup) {
      setIsModalOpen(true);
      setWizardReady(false);
    }
  }, [needsSetup]);

  const handleModalOpenChange = useCallback((open: boolean) => {
    setIsModalOpen(open);
    if (!open && needsSetup) setWizardReady(true);
  }, [needsSetup]);

  const saveSettings = useCallback(
    async (newConfig: AppConfig) => {
      if (!sitecoreContextId) throw new Error('Sitecore context ID is not defined');

      const store = createJsonStore<AppConfig>(client, sitecoreContextId, appConfigJsonStoreConfig);
      await store.set(newConfig);

      setConfig(newConfig);
      setIsModalOpen(false);
      setWizardReady(true);
    },
    [client, sitecoreContextId]
  );

  const markSetupComplete = useCallback(async () => {
    if (!sitecoreContextId) return;
    try {
      const store = createKVStore(client, sitecoreContextId, setupFlagStoreConfig);
      await store.set('setup_complete', 'true');
    } catch {
      // best-effort
    }
    setNeedsSetup(false);
    setWizardReady(false);
  }, [client, sitecoreContextId]);

  return (
    <AppSettingsContext.Provider
      value={{ config, setModalOpen: setIsModalOpen, saveSettings, needsSetup, setNeedsSetup, markSetupComplete, wizardReady }}
    >
      {children}
      <AppSettingsModal isOpen={isModalOpen} onOpenChange={handleModalOpenChange} />
    </AppSettingsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function FieldHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className='h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0' />
      </TooltipTrigger>
      <TooltipContent side='right' className='max-w-56 text-xs'>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface AppSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSettingsModal({ isOpen, onOpenChange }: AppSettingsModalProps) {
  const { config, saveSettings } = useAppSettingsInternal();
  const [temp, setTemp] = useState<AppConfig>(config);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setTemp(config);
  }, [isOpen, config]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(temp);
    } finally {
      setIsSaving(false);
    }
  };

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setTemp((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]' onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>LLMify Settings</DialogTitle>
          <DialogDescription>
            Configure field names and crawl options.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delayDuration={200}>
          <div className='grid gap-4 py-4'>
            {/* API key */}
            <div className='space-y-2'>
              <div className='flex items-center gap-1.5'>
                <Label htmlFor='cfg-gateway-key'>Vercel AI Gateway API key</Label>
                <FieldHint text='Required to call AI models via Vercel AI Gateway. Obtain it from your Vercel dashboard under AI → Gateway.' />
              </div>
              <Input
                id='cfg-gateway-key'
                placeholder='sk-...'
                value={temp.vercelAiGatewayApiKey}
                onChange={(e) => set('vercelAiGatewayApiKey', e.target.value)}
                type='password'
              />
            </div>

            {/* Field names section */}
            <div className='space-y-3'>
              <div>
                <p className='text-sm font-medium'>Sitecore field names</p>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  Names of fields added to your templates by the setup wizard. Change only if your project uses different names.
                </p>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <div className='flex items-center gap-1.5'>
                    <Label htmlFor='cfg-target'>AEO content field</Label>
                    <FieldHint text='Field on page templates where generated AEO markdown is saved (Plugin field type).' />
                  </div>
                  <Input
                    id='cfg-target'
                    placeholder='AiMarkdown'
                    value={temp.targetFieldName}
                    onChange={(e) => set('targetFieldName', e.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <div className='flex items-center gap-1.5'>
                    <Label htmlFor='cfg-meta'>Metadata field</Label>
                    <FieldHint text='Field on page templates storing generation metadata (model used, timestamp, token counts) as JSON.' />
                  </div>
                  <Input
                    id='cfg-meta'
                    placeholder='AiMarkdownMeta'
                    value={temp.metaFieldName}
                    onChange={(e) => set('metaFieldName', e.target.value)}
                  />
                </div>
              </div>

              <div className='space-y-2'>
                <div className='flex items-center gap-1.5'>
                  <Label htmlFor='cfg-llmtxt'>Site LLM.txt field</Label>
                  <FieldHint text='Field on the site settings template where the generated llm.txt file content is stored.' />
                </div>
                <Input
                  id='cfg-llmtxt'
                  placeholder='AiLlmTxt'
                  value={temp.llmFieldName}
                  onChange={(e) => set('llmFieldName', e.target.value)}
                />
              </div>
            </div>
          </div>
        </TooltipProvider>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useAppSettingsInternal() {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error('Must be used within an AppSettingsProvider');
  }
  return context;
}

export function useAppConfig(): AppConfig {
  return useAppSettingsInternal().config;
}

export function useAppSettings() {
  const { setModalOpen, config, saveSettings, needsSetup, setNeedsSetup, markSetupComplete, wizardReady } = useAppSettingsInternal();
  return { setModalOpen, config, saveSettings, needsSetup, setNeedsSetup, markSetupComplete, wizardReady };
}
