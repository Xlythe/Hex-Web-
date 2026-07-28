import React from 'react';

interface IconProps {
  className?: string;
}

export const UserIcon: React.FC<IconProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      shapeRendering="geometricPrecision"
      className={className || "w-5 h-5 text-theme-icon-light dark:text-theme-icon-dark opacity-70"}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A18.75 18.75 0 0112 22.5c-2.786 0-5.433-.608-7.499-1.688z"
      />
    </svg>
  );
};
