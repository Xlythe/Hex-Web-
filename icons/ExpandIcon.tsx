import React from 'react';

interface IconProps {
  className?: string;
}

export const ExpandIcon: React.FC<IconProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      shapeRendering="geometricPrecision"
      className={className || "w-6 h-6"} // Default size, can be overridden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15"
      />
    </svg>
  );
};