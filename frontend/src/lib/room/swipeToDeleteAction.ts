// swipeToDeleteAction.ts
interface SwipeToDeleteOptions {
  threshold?: number; // Min horizontal distance in pixels to trigger delete
  onDelete: () => void; // Callback when delete is triggered
  getIsActive?: () => boolean; // Optional: function to check if the associated item is "active" (to disable swipe)
  enableMouse?: boolean; // Explicitly enable/disable mouse support
}

export function swipeToDelete(node: HTMLElement, options: SwipeToDeleteOptions) {
  let startX: number;
  let startY: number;
  let currentX: number;
  let currentY: number;
  let isPointerActive = false; // True if touch or mouse button is down
  let isLikelySwipe = false; // True if movement is primarily horizontal
  let isMouseEvent = false;    // True if the current interaction is mouse-based

  const SWIPE_SENSITIVITY = 5; // Pixels before we consider it a horizontal swipe attempt
  const threshold = options.threshold || 75;
  const mouseSupportEnabled = options.enableMouse !== undefined ? options.enableMouse : true; // Default to true

  node.style.willChange = 'transform';

  function getPointerCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if (event instanceof MouseEvent) {
      return { x: event.clientX, y: event.clientY };
    }
    if (event.touches && event.touches.length > 0) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    return null; // Should not happen if called correctly
  }

  function handlePointerDown(event: MouseEvent | TouchEvent) {
    if (options.getIsActive && options.getIsActive()) return;
    if (isPointerActive) return; // Already handling a pointer

    isMouseEvent = event instanceof MouseEvent;

    if (isMouseEvent) {
      if ((event as MouseEvent).button !== 0) return; // Only left mouse button
    } else { // TouchEvent
      if ((event as TouchEvent).touches.length !== 1) return; // Only single touch
    }
    
    const coords = getPointerCoordinates(event);
    if (!coords) return;

    startX = coords.x;
    startY = coords.y;
    currentX = startX;
    currentY = startY;
    isPointerActive = true;
    isLikelySwipe = false;
    node.style.transition = 'transform 0s'; // Allow direct following of pointer

    if (isMouseEvent) {
      document.addEventListener('mousemove', handlePointerMove);
      document.addEventListener('mouseup', handlePointerUp);
      document.body.style.userSelect = 'none'; // Prevent text selection during drag
    } else {
      // For touch, ensure passive:false on move to allow preventDefault
      document.addEventListener('touchmove', handlePointerMove, { passive: false });
      document.addEventListener('touchend', handlePointerUp);
      document.addEventListener('touchcancel', handlePointerUp);
    }
  }

  function handlePointerMove(event: MouseEvent | TouchEvent) {
    if (!isPointerActive) return;

    const coords = getPointerCoordinates(event);
    if (!coords) { // e.g. all touches lifted mid-move but before touchend
        if (!isMouseEvent && (event as TouchEvent).touches.length === 0) {
            handlePointerUp(event); // Treat as end of interaction
        }
        return;
    }


    currentX = coords.x;
    currentY = coords.y;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    if (!isLikelySwipe) {
      if (Math.abs(deltaX) > SWIPE_SENSITIVITY || Math.abs(deltaY) > SWIPE_SENSITIVITY) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          isLikelySwipe = true;
        } else {
          // More vertical movement, assume scroll and release control
          isPointerActive = false; // Stop our handling
          cleanUpDocumentListeners();
          // No transform reset needed here as it wasn't a swipe
          return;
        }
      }
    }
    
    if (isLikelySwipe) {
      // For touch events, prevent default to stop page scroll only if we're swiping.
      // Mouse events don't typically scroll the page on drag unless specific browser behavior.
      if (!isMouseEvent) {
        event.preventDefault();
      }
      const targetTranslateX = Math.min(0, deltaX); // Only allow negative (left) translation
      const limitedTranslateX = Math.max(targetTranslateX, -(threshold + 40)); // Cap visual feedback
      node.style.transform = `translateX(${limitedTranslateX}px)`;
      node.style.opacity = '' + (1 - Math.abs(limitedTranslateX / threshold));
    }
  }

  function handlePointerUp(event?: MouseEvent | TouchEvent) { // Event might not be passed on destroy
    if (!isPointerActive && event) { // If called without active pointer (e.g. during destroy with no drag)
        cleanUpDocumentListeners(); // ensure listeners are cleaned
        return;
    }
    
    isPointerActive = false; // Important to set this early
    const deltaX = currentX - startX; // Use last known currentX

    node.style.transition = 'transform 0.2s ease-out';

    if (isLikelySwipe && deltaX < -threshold) {
      node.style.transform = `translateX(-100%)`;
      setTimeout(() => {
        options.onDelete();
      }, 150); // Allow animation to (mostly) complete
      
      // Prevent click after a successful swipe (for both touch and mouse)
      node.addEventListener('click', preventClickCapture, { capture: true, once: true });
    } else {
      node.style.transform = 'translateX(0px)';
      node.style.opacity = '1';
    }
    
    isLikelySwipe = false; // Reset for next interaction
    cleanUpDocumentListeners();
  }

  function preventClickCapture(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  function cleanUpDocumentListeners() {
    if (isMouseEvent) {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
      document.body.style.userSelect = ''; // Restore text selection
    } else {
      document.removeEventListener('touchmove', handlePointerMove);
      document.removeEventListener('touchend', handlePointerUp);
      document.removeEventListener('touchcancel', handlePointerUp);
    }
  }

  // Attach initial listeners to the node
  node.addEventListener('touchstart', handlePointerDown, { passive: true });
  if (mouseSupportEnabled) {
    node.addEventListener('mousedown', handlePointerDown);
  }

  return {
    destroy() {
      node.removeEventListener('touchstart', handlePointerDown);
      if (mouseSupportEnabled) {
        node.removeEventListener('mousedown', handlePointerDown);
      }
      // If dragging was active when component is destroyed, clean up document listeners
      if (isPointerActive) {
        handlePointerUp(); // Call with no event to ensure cleanup
      }
      node.removeEventListener('click', preventClickCapture, { capture: true });
    }
  };
}