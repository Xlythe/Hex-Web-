
import React from 'react';

interface ColorPickerProps {
  /** Array of colors to display. Expected to have at least 7 colors for the default layout. */
  availableColors: readonly string[];
  /** The currently selected color. */
  selectedColor: string;
  /** A color that should be disabled (e.g., selected by the other player). */
  disabledColor?: string | null;
  /** Callback function triggered when a color is selected. */
  onColorSelect: (color: string) => void;
  /** Optional size for the color picker. 'sm' is smaller, 'md' is larger. */
  size?: 'sm' | 'md';
}

/**
 * `ColorPicker` is a component that displays a selection of colors
 * arranged in a 2-3-2 hexagonal grid pattern with small spacing between them.
 * It allows users to pick a color, with visual states for selected,
 * disabled (e.g., taken by another player), and available colors.
 * Borders are achieved by layering two hexagons.
 */
const ColorPicker: React.FC<ColorPickerProps> = ({
  availableColors,
  selectedColor,
  disabledColor,
  onColorSelect,
  size = 'sm', // Default to small size
}) => {
  // Define dimensions based on the size prop.
  const baseHeightPx = size === 'sm' ? 30 : 40;
  const hexHeightStyle = `${baseHeightPx}px`;
  const hexWidthStyle = `${Math.round(baseHeightPx * (Math.sqrt(3) / 2))}px`;

  const clipPathValue = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

  const colorsToDisplay = [...availableColors.slice(0, 7)];
  while (colorsToDisplay.length < 7) {
    colorsToDisplay.push('#E5E7EB'); // A light gray placeholder
  }

  const H_NUM = baseHeightPx; // Full height of one hexagon
  const W_NUM = parseFloat(hexWidthStyle); // Full width of one hexagon
  
  const SPACING_AMOUNT_PX = size === 'sm' ? 1.5 : 2; // Visual spacing between hex edges

  // Adjust distances for effective center-to-center spacing including the visual gap
  const HEX_OUTER_WIDTH_WITH_SPACING_EFFECT = W_NUM + SPACING_AMOUNT_PX / Math.sin(Math.PI / 3); // Effective width considering spacing for layout
  const HEX_OUTER_HEIGHT_WITH_SPACING_EFFECT = H_NUM + SPACING_AMOUNT_PX;                       // Effective height

  // Horizontal distance between centers of adjacent hexes in the same row
  const HDIST_ROW_ADJACENT_CENTER = HEX_OUTER_WIDTH_WITH_SPACING_EFFECT;
  // Horizontal offset for centers of staggered hexes
  const HDIST_STAGGER_CENTER = HDIST_ROW_ADJACENT_CENTER / 2;
  // Vertical distance between centerlines of adjacent rows
  const VDIST_ROW_CENTER = (HEX_OUTER_HEIGHT_WITH_SPACING_EFFECT * 0.75);


  const hexPositions = [
    // Top Row (2)
    { x: -HDIST_STAGGER_CENTER, y: -VDIST_ROW_CENTER }, // Top-Left
    { x: HDIST_STAGGER_CENTER,  y: -VDIST_ROW_CENTER }, // Top-Right
    // Middle Row (3)
    { x: -HDIST_ROW_ADJACENT_CENTER, y: 0 },            // Middle-Left
    { x: 0,                          y: 0 },            // Middle-Center
    { x: HDIST_ROW_ADJACENT_CENTER,  y: 0 },            // Middle-Right
    // Bottom Row (2)
    { x: -HDIST_STAGGER_CENTER, y: VDIST_ROW_CENTER },  // Bottom-Left
    { x: HDIST_STAGGER_CENTER,  y: VDIST_ROW_CENTER },  // Bottom-Right
  ];
  
  const containerWidth = 3 * W_NUM + 2 * SPACING_AMOUNT_PX;
  const containerHeight = 2 * VDIST_ROW_CENTER + H_NUM;

  return (
    <div
      className="relative"
      style={{
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
      }}
      role="radiogroup"
      aria-label="Color picker"
    >
      {colorsToDisplay.map((color, index) => {
        const isSelected = color === selectedColor;
        const isDisabled = color === disabledColor;
        const position = hexPositions[index]; 

        if (!position) return null; 

        return (
          <button
            key={`color-hex-${index}`}
            type="button"
            onClick={() => !isDisabled && onColorSelect(color)}
            disabled={isDisabled}
            className={`
              absolute transition-transform duration-150 ease-in-out focus:outline-none group
              ${isSelected ? 'z-10 scale-110' : ''}
              ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105'}
            `}
            style={{
              width: hexWidthStyle,
              height: hexHeightStyle,
              top: `calc(50% + ${position.y}px)`, 
              left: `calc(50% + ${position.x}px)`, 
              transform: 'translate(-50%, -50%)', 
            }}
            aria-label={`Select color ${color}${isSelected ? ' (selected)' : ''}${isDisabled ? ' (unavailable)' : ''}`}
            aria-checked={isSelected}
            role="radio"
          >
            {/* Outer Div (Border Layer) */}
            <div
              className={`
                absolute inset-0 transition-colors duration-150 ease-in-out
                ${isDisabled ? 'bg-transparent' : ''}
                ${isSelected ? 'bg-gray-800 dark:bg-gray-100' : ''}
                ${!isSelected && !isDisabled ? 'group-hover:bg-gray-400 dark:group-hover:bg-gray-500' : ''}
                ${!isSelected && !isDisabled && !(typeof color === 'string' && color.startsWith('group-hover:')) ? 'bg-transparent' : ''}
              `}
              style={{
                clipPath: clipPathValue,
                WebkitClipPath: clipPathValue,
              }}
            />

            {/* Inner Div (Color Fill Layer) */}
            <div
              className={`
                absolute inset-0 transition-transform duration-150 ease-in-out
                ${isSelected ? 'scale-[0.82]' : ''}
                ${!isSelected && !isDisabled ? 'group-hover:scale-[0.92]' : 'scale-100'}
              `}
              style={{
                backgroundColor: color,
                clipPath: clipPathValue,
                WebkitClipPath: clipPathValue,
              }}
            />
          </button>
        );
      })}
    </div>
  );
};

export default ColorPicker;
