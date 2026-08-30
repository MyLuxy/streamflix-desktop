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

    const updateFocusableElements = () => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable="true"]')
      );
      focusableElementsRef.current = elements;

      if (elements.length > 0 && !document.activeElement?.hasAttribute('data-focusable')) {
        elements[0].focus();
        elements[0].classList.add('focused');
        focusedIndexRef.current = 0;
      }
    };

    updateFocusableElements();

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
          nextIndex = findElementInDirection(elements, currentElement, 'right');
          handled = true;
          break;
        }

        case 'ArrowLeft':
        case 'Left': {
          e.preventDefault();
          nextIndex = findElementInDirection(elements, currentElement, 'left');
          handled = true;
          break;
        }

        case 'ArrowDown':
        case 'Down': {
          e.preventDefault();
          nextIndex = findElementInDirection(elements, currentElement, 'down');
          handled = true;
          break;
        }

        case 'ArrowUp':
        case 'Up': {
          e.preventDefault();
          nextIndex = findElementInDirection(elements, currentElement, 'up');
          handled = true;
          break;
        }

        case 'Enter':
        case ' ': {
          e.preventDefault();
          currentElement.click();
          handled = true;
          break;
        }

        case 'Escape':
        case 'Backspace':
        case 'Back': {
          e.preventDefault();
          const backButton = document.querySelector<HTMLElement>('[data-action="back"]');
          if (backButton) {
            backButton.click();
          }
          handled = true;
          break;
        }
      }

      if (handled && nextIndex !== currentIndex) {
        currentElement.classList.remove('focused');
        currentElement.blur();

        const nextElement = elements[nextIndex];
        nextElement.focus();
        nextElement.classList.add('focused');
        focusedIndexRef.current = nextIndex;

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

    const distance = Math.sqrt(
      Math.pow(center.x - currentCenter.x, 2) +
      Math.pow(center.y - currentCenter.y, 2)
    );

    // bias toward elements roughly aligned with current, not just closest
    let weight = 1;
    if (direction === 'left' || direction === 'right') {
      const verticalAlignment = Math.abs(center.y - currentCenter.y);
      weight = 1 + verticalAlignment / 100;
    } else {
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
