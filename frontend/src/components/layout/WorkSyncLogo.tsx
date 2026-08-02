"use client";

import React from "react";

interface LogoProps {
  className?: string;
}

export default function WorkSyncLogo({ className = "w-8 h-8" }: LogoProps) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      <defs>
        <linearGradient id="worksync-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" /> {/* Teal-400 */}
          <stop offset="40%" stopColor="#0d9488" /> {/* Teal-600 */}
          <stop offset="70%" stopColor="#0284c7" /> {/* Sky-600 */}
          <stop offset="100%" stopColor="#1e3a8a" /> {/* Blue-900 */}
        </linearGradient>
      </defs>
      
      {/* S-shaped main ribbon */}
      <path 
        d="M72 14H44C33 14 24 23 24 34C24 45 33 54 44 54H56C67 54 76 63 76 74C76 85 67 94 56 94H28" 
        stroke="url(#worksync-logo-gradient)" 
        strokeWidth="12" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      {/* Accent inner curve to match overlapping ribbon effect */}
      <path 
        d="M58 34H48" 
        stroke="url(#worksync-logo-gradient)" 
        strokeWidth="12" 
        strokeLinecap="round"
      />
    </svg>
  );
}
