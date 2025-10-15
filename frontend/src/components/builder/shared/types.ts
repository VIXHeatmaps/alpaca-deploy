import type { Element } from "../../../types/builder";
import type { ValidationError } from "../../../utils/validation";
import type { TickerMetadata } from "../../../api/tickers";

/**
 * Base props shared by all builder card components
 *
 * This interface captures the common props that every card needs:
 * - Element data and update handlers
 * - Depth/weight display options
 * - Validation errors
 * - Variable lists and metadata
 * - Clipboard for copy/paste
 *
 * Individual cards extend this with their specific element type:
 * ```tsx
 * interface GateCardProps extends BaseCardProps<GateElement> {
 *   isWeightInvalid?: boolean;
 * }
 * ```
 */
export interface BaseCardProps<T extends Element> {
  /** The element data for this card */
  element: T;
  /** Callback when element is updated */
  onUpdate: (updated: T) => void;
  /** Callback when element is deleted */
  onDelete: () => void;
  /** Optional callback when element is copied */
  onCopy?: () => void;
  /** Element currently in clipboard (for paste operations) */
  clipboard?: Element | null;
  /** Nesting depth for visual indentation (default: 0) */
  depth?: number;
  /** Whether to show weight input field (default: true) */
  showWeight?: boolean;
  /** All elements in the builder (for counting gates/scales/sorts) */
  allElements?: Element[];
  /** Array of validation errors to highlight fields */
  validationErrors?: ValidationError[];
  /** Array of defined variable lists for validation */
  variableLists?: Array<{ name: string }>;
  /** Whether variables are currently loading */
  variablesLoading?: boolean;
  /** Map of ticker metadata from Alpaca */
  tickerMetadata?: Map<string, TickerMetadata>;
  /** Whether ticker metadata is currently loading */
  metadataLoading?: boolean;
  /** Error message from ticker metadata fetch */
  metadataError?: string | null;
  /** Callback when a new variable is created */
  onVariableCreated?: () => void;
}
