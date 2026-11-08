import React from "react";

export interface LogoProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Logo Ikon Attendance resmi persis seperti di Google Form Sync Add-On.
 */
export const AttendanceLogo: React.FC<LogoProps> = ({
  className = "w-4 h-4 shrink-0",
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <rect width="6" height="6" x="3" y="3" rx="1.5" />
    <rect width="6" height="6" x="15" y="3" rx="1.5" />
    <rect width="6" height="6" x="3" y="15" rx="1.5" />
    <path d="M21 15h-3a2 2 0 0 0-2 2v4" />
    <path d="M21 21v.01" />
    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
    <path d="M16 12h1" />
    <path d="M12 16v5" />
  </svg>
);
