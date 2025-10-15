/**
 * Field Width Utilities
 *
 * Calculates dynamic field widths for consistent sizing across all builder cards.
 * Ensures fields resize to fit content without truncation.
 */

export const fieldWidth = {
  /**
   * Calculate width for name/text input fields
   * @param value - The current field value
   * @param min - Minimum width in pixels (default: 80)
   * @returns CSS width string
   */
  name: (value: string, min = 80): string => {
    return `${Math.max((value?.length || 0) * 8 + 30, min)}px`;
  },

  /**
   * Calculate width for ticker input fields
   * @param value - The current ticker value
   * @param min - Minimum width in pixels (default: 80)
   * @returns CSS width string
   */
  ticker: (value: string, min = 80): string => {
    return `${Math.max((value?.length || 0) * 9 + 20, min)}px`;
  },

  /**
   * Calculate width for indicator dropdown fields
   * @param label - The indicator label (with underscores replaced by spaces)
   * @param min - Minimum width in pixels (default: 120)
   * @returns CSS width string
   */
  indicator: (label: string, min = 120): string => {
    return `${Math.max(label.length * 9 + 30, min)}px`;
  },
};
