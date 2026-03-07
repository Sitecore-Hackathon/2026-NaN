"use client";

import AppContext from "@/components/custom/app-context";
import { usePreviewContextId } from "@/components/providers/marketplace";
import { useMemo } from "react";

function StandaloneExtension() {
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
      <div className="space-y-4">
        <AppContext />
      </div>
      {/* {sites && <div className="space-y-4">
        <h2 className="mb-4 text-2xl font-bold">Sites</h2>
        {sites.data?.map((site) => (
           <SiteInfo key={site.id} site={site} />
        ))} 
      </div>} */}
    </div >
  );
}

export default StandaloneExtension;
