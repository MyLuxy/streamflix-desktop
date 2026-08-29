// src/hooks/useSpatialNavigation.ts
import { useEffect, useRef } from 'react';

interface FocusableElement {
  element: HTMLElement;
  rect: DOMRect;
}

export function useSpatialNavigation(enabled: boolean) {
  const focusedIndexRef = useRef(0);
  const focusableElementsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    if (!enabled) return;

    // Get all focusable elements
    const updateFocusableElements = () => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable="true"]')
      );
      focusableElementsRef.current = elements;

      // Focus first element if none focused
      if (elements.length > 0 && !document.activeElement?.hasAttribute('data-focusable')) {
        elements[0].focus();
        elements[0].classList.add('focused');
        focusedIndexRef.current = 0;
      }
    };

    updateFocusableElements();

    // Re-scan when content changes
    const observer = new MutationObserver(updateFocusableElements);
    observer.observe(document.body, { childList: true, subtree: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      const elements = focusableElementsRef.current;
      if (elements.length === 0) return;

      const currentIndex = focusedIndexRef.current;
      const currentElement = elements[currentIndex];

      let nextIndex = currentIndex;
      let handled = false;

      switch (e.key) {
        case 'ArrowRight':
        case 'Right': {
          e.preventDefault();
          // Find element to the right
          nextIndex = findElementInDirection(elements, currentElement, 'right');
          handled = true;
          break;
        }

        case 'ArrowLeft':
        case 'Left': {
          e.preventDefault();
          // Find element to the left
          nextIndex = findElementInDirection(elements, currentElement, 'left');
          handled = true;
          break;
        }

        case 'ArrowDown':
        case 'Down': {
          e.preventDefault();
          // Find element below
          nextIndex = findElementInDirection(elements, currentElement, 'down');
          handled = true;
          break;
        }

        case 'ArrowUp':
        case 'Up': {
          e.preventDefault();
          // Find element above
          nextIndex = findElementInDirection(elements, currentElement, 'up');
          handled = true;
          break;
        }

        case 'Enter':
        case ' ': {
          e.preventDefault();
          // Click the focused element
          currentElement.click();
          handled = true;
          break;
        }

        case 'Escape':
        case 'Backspace':
        case 'Back': {
          e.preventDefault();
          // Find and click back button
          const backButton = document.querySelector<HTMLElement>('[data-action="back"]');
          if (backButton) {
            backButton.click();
          }
          handled = true;
          break;
        }
      }

      if (handled && nextIndex !== currentIndex) {
        // Remove focus from current
        currentElement.classList.remove('focused');
        currentElement.blur();

        // Focus next element
        const nextElement = elements[nextIndex];
        nextElement.focus();
        nextElement.classList.add('focused');
        focusedIndexRef.current = nextIndex;

        // Scroll into view
        nextElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      observer.disconnect();
    };
  }, [enabled]);
}

// Find the nearest element in a given direction
function findElementInDirection(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: 'up' | 'down' | 'left' | 'right'
): number {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2,
  };

  let bestIndex = elements.indexOf(current);
  let bestDistance = Infinity;

  elements.forEach((element, index) => {
    if (element === current) return;

    const rect = element.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    // Check if element is in the correct direction
    let isInDirection = false;
    switch (direction) {
      case 'right':
        isInDirection = center.x > currentCenter.x;
        break;
      case 'left':
        isInDirection = center.x < currentCenter.x;
        break;
      case 'down':
        isInDirection = center.y > currentCenter.y;
        break;
      case 'up':
        isInDirection = center.y < currentCenter.y;
        break;
    }

    if (!isInDirection) return;

    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(center.x - currentCenter.x, 2) +
      Math.pow(center.y - currentCenter.y, 2)
    );

    // Weight distance based on alignment
    let weight = 1;
    if (direction === 'left' || direction === 'right') {
      // Prefer elements aligned vertically
      const verticalAlignment = Math.abs(center.y - currentCenter.y);
      weight = 1 + verticalAlignment / 100;
    } else {
      // Prefer elements aligned horizontally
      const horizontalAlignment = Math.abs(center.x - currentCenter.x);
      weight = 1 + horizontalAlignment / 100;
    }

    const weightedDistance = distance * weight;

    if (weightedDistance < bestDistance) {
      bestDistance = weightedDistance;
      bestIndex = index;
    }
  });

  return bestIndex;
}
