import React from "react";

export interface FormSyncBrandLogoProps {
  className?: string;
  showDomain?: boolean;
}

/**
 * Komponen Logo Resmi FormSync untuk Latar Putih Bersih (Light Mode).
 * Menampilkan tipografi Form (Slate-800) dan Sync (Corporate Red #F70419)
 * dengan lambang sayap aerodinamis resmi FormSync.
 */
export const FormSyncBrandLogo: React.FC<FormSyncBrandLogoProps> = ({
  className = "h-8 sm:h-9 w-auto shrink-0",
  showDomain = true,
}) => {
  return (
    <div className="flex items-center gap-3 select-none">
      {/* Vektor Resmi Simbol & Tipografi FormSync Asli */}
      <img
        src="/icon.svg"
        alt="FormSync Official Logo"
        className={className}
        style={{ maxHeight: "36px", width: "auto" }}
      />

      {/* Domain Subtitle Tag */}
      {showDomain && (
        <div className="hidden sm:flex flex-col justify-center border-l border-slate-200 pl-2.5">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
            Gate Portal
          </span>
          <span className="text-[11px] font-mono text-slate-400 leading-tight">
            formsync.my.id
          </span>
        </div>
      )}
    </div>
  );
};
