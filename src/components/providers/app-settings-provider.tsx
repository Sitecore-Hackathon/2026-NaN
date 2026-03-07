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

        <div className='grid gap-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='cfg-llm'>Vercel AI Gateway API key</Label>
            <Input
              id='cfg-llm'
              placeholder='sk-...'
              value={temp.vercelAiGatewayApiKey}
              onChange={(e) => set('vercelAiGatewayApiKey', e.target.value)}
              type='password'
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='cfg-target'>Target field name</Label>
              <Input
                id='cfg-target'
                className='focus:ring-primary'
                placeholder='AiMarkdown'
                value={temp.targetFieldName}
                onChange={(e) => set('targetFieldName', e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='cfg-meta'>Meta field name</Label>
              <Input
                id='cfg-meta'
                placeholder='AiMarkdownMeta'
                value={temp.metaFieldName}
                onChange={(e) => set('metaFieldName', e.target.value)}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='cfg-llm'>LLM.txt field name</Label>
            <Input
              id='cfg-llm'
              placeholder='AiLlmTxt'
              value={temp.llmFieldName}
              onChange={(e) => set('llmFieldName', e.target.value)}
            />
          </div>
        </div>

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
