import React from "react";

export interface FormSyncSquareLogoProps {
  className?: string;
  size?: number;
}

/**
 * Komponen Ikon Persegi Resmi FormSync.
 * Menampilkan simbol form sync 4-node dalam kontainer rounded warna rose/merah muda,
 * 1:1 persis seperti modal dialog Google Sheets resmi FormSync.
 * Bebas emoticon, menggunakan SVG murni berkualitas tinggi.
 */
export const FormSyncSquareLogo: React.FC<FormSyncSquareLogoProps> = ({
  className = "size-10",
}) => {
  return (
    <div
      className={`rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      aria-label="FormSync Badge Logo"
    >
      <svg
        viewBox="0 0 28 28"
        className="size-6 text-rose-600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Node Atas Kiri */}
        <circle cx="8" cy="8" r="3" stroke="#e11d48" strokeWidth="2" fill="#fff" />
        {/* Node Atas Kanan */}
        <circle cx="20" cy="8" r="3" stroke="#e11d48" strokeWidth="2" fill="#fff" />
        {/* Node Bawah Kiri */}
        <circle cx="8" cy="20" r="3" stroke="#e11d48" strokeWidth="2" fill="#fff" />
        {/* Node Bawah Kanan */}
        <circle cx="20" cy="20" r="3" stroke="#e11d48" strokeWidth="2" fill="#fff" />
        
        {/* Garis Penghubung Sinkronisasi Dinamis */}
        <path
          d="M11 8H17 M8 11V17 M20 11V17 M11 20H17"
          stroke="#e11d48"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Titik Tengah Sinergi */}
        <circle cx="14" cy="14" r="1.5" fill="#e11d48" />
      </svg>
    </div>
  );
};
