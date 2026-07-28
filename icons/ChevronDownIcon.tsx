import React from 'react';

interface IconProps {
  className?: string;
}

export const ChevronDownIcon: React.FC<IconProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5} // Consistent with its usage in ProfileModal
      stroke="currentColor"
      shapeRendering="geometricPrecision"
      className={className || "w-6 h-6"} // Default size, ProfileModal uses w-4 h-4
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
};