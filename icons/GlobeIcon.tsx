import React from 'react';

interface IconProps {
  className?: string;
}

export const GlobeIcon: React.FC<IconProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className || "w-5 h-5 text-theme-icon-light dark:text-theme-icon-dark opacity-70"} 
      shapeRendering="geometricPrecision" // Added for consistency
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" // Added for consistency
        d="M12 21a9 9 0 100-18 9 9 0 000 18z" // Globe outline
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" // Added for consistency
        d="M3.56 9H20.44M3.56 15H20.44M9 3.56V20.44M15 3.56V20.44" // Lines of latitude/longitude
      />
       <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        vectorEffect="non-scaling-stroke" 
        d="M12 21a8.949 8.949 0 005.632-2.038M12 21a8.949 8.949 0 01-5.632-2.038m5.632 2.038A9 9 0 0012 3a9 9 0 00-5.632 15.962M3.368 9.038A8.962 8.962 0 0112 3a8.962 8.962 0 018.632 6.038m-17.264 0A8.962 8.962 0 0012 21a8.962 8.962 0 008.632-11.962" 
      />
    </svg>
  );
};
