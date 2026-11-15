import React from "react";
import { FormSyncBrandLogo } from "./FormSyncBrandLogo";

export interface PortalHeaderProps {
  badgeText?: string;
}

/**
 * PortalHeader
 * Header navigasi atas untuk layar portal mandiri (Connect Event Screen & PIN Lock Screen).
 */
export const PortalHeader: React.FC<PortalHeaderProps> = ({ badgeText }) => {
  return (
    <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 bg-white select-none">
      <div className="flex items-center gap-3">
        <FormSyncBrandLogo className="h-6 w-auto" showDomain={false} />
        <h1 className="text-base font-bold text-slate-900 tracking-tight">
          FormSync Portal
        </h1>
      </div>
      {badgeText ? (
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
          {badgeText}
        </span>
      ) : null}
    </div>
  );
};
