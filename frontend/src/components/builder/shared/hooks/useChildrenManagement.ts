import type { Element } from "../../../../types/builder";

/**
 * Hook for managing child elements in container cards (Weight, Sort, Scale, Gate)
 *
 * Provides standard CRUD operations for child elements:
 * - updateChild: Update a specific child by ID
 * - deleteChild: Remove a child by ID
 * - addChild: Add a new child to the list
 *
 * Usage:
 * ```tsx
 * const { updateChild, deleteChild, addChild } = useChildrenManagement(
 *   element,
 *   onUpdate,
 *   'children' // or 'thenChildren', 'elseChildren', etc.
 * );
 * ```
 */
export function useChildrenManagement<T extends { id: string }>(
  element: T,
  onUpdate: (updated: T) => void,
  childrenKey: keyof T
) {
  const children = (element[childrenKey] as Element[]) || [];

  /**
   * Update a specific child element by ID
   */
  const updateChild = (id: string, updated: Element) => {
    const updatedChildren = children.map((child) =>
      child.id === id ? updated : child
    );
    onUpdate({
      ...element,
      [childrenKey]: updatedChildren,
    });
  };

  /**
   * Delete a child element by ID
   */
  const deleteChild = (id: string) => {
    const updatedChildren = children.filter((child) => child.id !== id);
    onUpdate({
      ...element,
      [childrenKey]: updatedChildren,
    });
  };

  /**
   * Add a new child element to the list
   */
  const addChild = (child: Element) => {
    onUpdate({
      ...element,
      [childrenKey]: [...children, child],
    });
  };

  return {
    children,
    updateChild,
    deleteChild,
    addChild,
  };
}
