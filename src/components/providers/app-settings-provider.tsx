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
}

const defaultConfig: AppConfig = {
  targetFieldName: 'AiMarkdown',
  metaFieldName: 'AiMarkdownMeta',
};

interface AppSettingsContextType {
  config: AppConfig;
  setModalOpen: (open: boolean) => void;
  saveSettings: (newConfig: AppConfig) => Promise<void>;
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

  const sitecoreContextId = appContext?.resourceAccess?.[0]?.context?.preview;

  useEffect(() => {
    if (!sitecoreContextId) return;

    const store = createJsonStore<AppConfig>(client, sitecoreContextId, appConfigJsonStoreConfig);
    store.get().then((saved) => {
      if (saved) setConfig({ ...defaultConfig, ...saved });
    });
  }, [sitecoreContextId, client]);

  const saveSettings = useCallback(
    async (newConfig: AppConfig) => {
      if (!sitecoreContextId) throw new Error('Sitecore context ID is not defined');

      const store = createJsonStore<AppConfig>(client, sitecoreContextId, appConfigJsonStoreConfig);
      await store.set(newConfig);

      setConfig(newConfig);
      setIsModalOpen(false);
    },
    [client, sitecoreContextId]
  );

  return (
    <AppSettingsContext.Provider
      value={{ config, setModalOpen: setIsModalOpen, saveSettings }}
    >
      {children}
      <AppSettingsModal isOpen={isModalOpen} onOpenChange={setIsModalOpen} />
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
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>AEO Helper Settings</DialogTitle>
          <DialogDescription>
            Configure field names and crawl options.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='cfg-target'>Target field name</Label>
              <Input
                id='cfg-target'
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
  const { setModalOpen, config, saveSettings } = useAppSettingsInternal();
  return { setModalOpen, config, saveSettings };
}
