import React from 'react';

export function ClinicLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect width="36" height="36" rx="10" fill="#14283F" />
      <path
        d="M18 8V28M8 18H28"
        stroke="#087F8C"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="4.5" fill="#E6F5F5" />
      <circle cx="27" cy="9" r="3" fill="#21A675" />
    </svg>
  );
}
