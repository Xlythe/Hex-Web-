import React from 'react';

interface IconProps {
  className?: string;
}

export const HourglassIcon: React.FC<IconProps> = ({ className }) => {
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
        d="M6 20V4h12v16H6zM6 4l6 6 6-6M6 20l6-6 6 6"
      />
    </svg>
  );
};