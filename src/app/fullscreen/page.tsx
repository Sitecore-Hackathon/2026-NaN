"use client";

import AppContext from "@/components/custom/app-context";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/components/providers/app-settings-provider";
import { usePreviewContextId } from "@/components/providers/marketplace";
import { useMemo } from "react";

function StandaloneExtension() {
  const { setModalOpen } = useAppSettings();

  // get context id to perform query
  const sitecoreContextId = usePreviewContextId();
  // memoize query options: cause we pass it to hook
  const listSitesOptions = useMemo(
    () => ({
      params: { query: { sitecoreContextId } }
    }),
    [sitecoreContextId]);

  return (
    <div className="container mx-auto p-6 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AEO Generator</h1>
        <Button variant="outline" onClick={() => setModalOpen(true)}>
          Settings
        </Button>
      </div>
      <div className="space-y-4">
        <AppContext />
      </div>
    </div>
  );
}

export default StandaloneExtension;
