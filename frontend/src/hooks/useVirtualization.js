// useVirtualization - Hook for virtualized list management
// Handles item sizing, scroll position, and dynamic height measurement

import { useState, useEffect, useCallback, useRef } from 'react';

export function useVirtualization(items, itemSizeFn, options = {}) {
  const { bufferSize = 3, minItemHeight = 150, maxItemHeight = 500 } = options;
  
  const [visibleItems, setVisibleItems] = useState([]);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [totalHeight, setTotalHeight] = useState(0);
  const itemHeightsRef = useRef(new Map());
  const listRef = useRef(null);
  
  // Calculate total height
  useEffect(() => {
    const height = items.reduce((sum, item, index) => {
      const cachedHeight = itemHeightsRef.current.get(index);
      return sum + (cachedHeight || minItemHeight);
    }, 0);
    setTotalHeight(height);
  }, [items, minItemHeight]);

  // Calculate visible items based on scroll position
  const calculateVisibleItems = useCallback((scrollTop, containerHeight) => {
    let visibleStart = 0;
    let currentHeight = 0;
    
    // Find start index
    while (visibleStart < items.length) {
      const itemHeight = itemHeightsRef.current.get(visibleStart) || minItemHeight;
      if (currentHeight + itemHeight > scrollTop) {
        break;
      }
      currentHeight += itemHeight;
      visibleStart++;
    }
    
    // Find end index
    let visibleEnd = visibleStart;
    currentHeight = 0;
    while (visibleEnd < items.length) {
      const itemHeight = itemHeightsRef.current.get(visibleEnd) || minItemHeight;
      if (currentHeight + itemHeight > containerHeight + bufferSize * minItemHeight) {
        break;
      }
      currentHeight += itemHeight;
      visibleEnd++;
    }
    
    return {
      startIndex: Math.max(0, visibleStart - bufferSize),
      endIndex: Math.min(items.length, visibleEnd + bufferSize),
    };
  }, [items, bufferSize, minItemHeight]);

  // Handle scroll
  const handleScroll = useCallback((e) => {
    const scrollTop = e.target.scrollTop;
    const containerHeight = e.target.clientHeight;
    
    setScrollPosition(scrollTop);
    
    const { startIndex, endIndex } = calculateVisibleItems(scrollTop, containerHeight);
    setVisibleItems(items.slice(startIndex, endIndex));
  }, [items, calculateVisibleItems]);

  // Measure item height
  const measureItem = useCallback((index, height) => {
    itemHeightsRef.current.set(index, height);
  }, []);

  // Reset size cache
  const resetCache = useCallback(() => {
    itemHeightsRef.current.clear();
  }, []);

  return {
    visibleItems,
    totalHeight,
    scrollPosition,
    handleScroll,
    measureItem,
    resetCache,
    listRef,
  };
}

export default function useVirtualizationHook(items, itemSizeFn, options = {}) {
  return useVirtualization(items, itemSizeFn, options);
}
