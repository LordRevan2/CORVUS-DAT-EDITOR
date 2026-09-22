import { useState, useCallback } from 'react';
import { DatEntry } from '../types';

export function useDatHistory(maxHistory: number = 30) {
  const [entries, setEntries] = useState<DatEntry[]>([]);
  const [history, setHistory] = useState<DatEntry[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [lastSavedIndex, setLastSavedIndex] = useState<number>(-1);

  const pushHistory = useCallback((newEntries: DatEntry[]) => {
    setHistory(prev => {
      // slice history to current index in case we are redoing
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newEntries);
      // Limit history size to maxHistory to prevent memory issues
      if (newHistory.length > maxHistory) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, maxHistory - 1));
    setEntries(newEntries);
  }, [historyIndex, maxHistory]);

  const undo = useCallback((): DatEntry[] | null => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const newEntries = history[newIndex];
      setEntries(newEntries);
      return newEntries;
    }
    return null;
  }, [historyIndex, history]);

  const redo = useCallback((): DatEntry[] | null => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const newEntries = history[newIndex];
      setEntries(newEntries);
      return newEntries;
    }
    return null;
  }, [historyIndex, history]);

  const resetHistory = useCallback((initialEntries: DatEntry[]) => {
    setHistory([initialEntries]);
    setHistoryIndex(0);
    setLastSavedIndex(0);
    setEntries(initialEntries);
  }, []);

  const hasUnsavedChanges = historyIndex !== lastSavedIndex && historyIndex !== -1;

  const markSaved = useCallback(() => {
    setLastSavedIndex(historyIndex);
  }, [historyIndex]);

  return {
    entries,
    setEntries,
    history,
    historyIndex,
    lastSavedIndex,
    hasUnsavedChanges,
    pushHistory,
    undo,
    redo,
    resetHistory,
    markSaved
  };
}
