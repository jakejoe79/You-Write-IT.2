// SceneList - Virtualized list of scenes
// Replaces ChapterList for scene-based streaming

import { VariableSizeList as List } from 'react-window';
import { useRef, useEffect, useCallback, useState } from 'react';
import SceneEditor from './SceneEditor.jsx';

/**
 * Estimate scene height based on word count
 * Base height: 150px + 0.5px per word
 */
function estimateSceneHeight(scene) {
  const baseHeight = 150;
  const wordCount = scene.text.split(/\s+/).length;
  const estimatedHeight = baseHeight + wordCount * 0.5;
  return Math.max(baseHeight, Math.min(estimatedHeight, 500));
}

/**
 * SceneList - Virtualized list of scenes
 * Replaces ChapterList for scene-based streaming
 */
export default function SceneList({ 
  scenes, 
  onEdit, 
  onRecompute,
  branchId = null,
}) {
  const listRef = useRef(null);
  const [estimatedHeight, setEstimatedHeight] = useState(0);
  
  // Reset size cache when scenes change
  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [scenes]);

  // Calculate total height
  useEffect(() => {
    const total = scenes.reduce((sum, scene, index) => {
      return sum + estimateSceneHeight(scene);
    }, 0);
    setEstimatedHeight(total);
  }, [scenes]);

  const renderScene = useCallback(({ index, style }) => {
    const scene = scenes[index];
    return (
      <div style={style} key={scene.id || index}>
        <SceneEditor
          scene={scene}
          index={index}
          onEdit={onEdit}
          onRecompute={onRecompute}
          branchId={branchId}
        />
      </div>
    );
  }, [scenes, onEdit, onRecompute, branchId]);

  return (
    <List
      ref={listRef}
      height={600}
      itemCount={scenes.length}
      itemSize={estimateSceneHeight}
      width="100%"
    >
      {renderScene}
    </List>
  );
}

export function useSceneList() {
  const listRef = useRef(null);
  
  const scrollToIndex = useCallback((index) => {
    listRef.current?.scrollToItem(index);
  }, []);
  
  const resetCache = useCallback(() => {
    listRef.current?.resetAfterIndex(0);
  }, []);
  
  return {
    listRef,
    scrollToIndex,
    resetCache,
  };
}
