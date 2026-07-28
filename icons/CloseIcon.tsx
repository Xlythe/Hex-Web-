import React from 'react';

interface IconProps {
  className?: string;
}

export const CloseIcon: React.FC<IconProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2} // Consistent with its usage in ProfileModal
      stroke="currentColor"
      shapeRendering="geometricPrecision"
      className={className || "w-6 h-6"} // Default size
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
};
