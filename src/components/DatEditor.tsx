import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DatEntry } from '../types';
import { parseDatFile, writeDatFile } from '../lib/datParser';
import { crc32 } from '../lib/crc32';
import { Search, Upload, Download, Plus, Save, BookOpen, Trash2, Undo, Redo, Sun, Moon, Pencil, ChevronUp, ChevronDown, ArrowRightLeft, BarChart2, CheckSquare, Square, Settings as SettingsIcon, Database, AlertTriangle, FileUp, FileDown, GitMerge, CornerDownLeft, Lock, Unlock, FileEdit, HelpCircle, Globe, Languages, Info, FileSpreadsheet, Layers, Sparkles, AlertCircle, X } from 'lucide-react';
import { useSettings, colorOptions, getColorClasses } from '../contexts/SettingsContext';
import { t, Language } from '../lib/i18n';
import Papa from 'papaparse';
import { useDatHistory } from '../hooks/useDatHistory';
import { useDragAndDrop } from '../hooks/useDragAndDrop';

export function DatEditor() {
  const { settings, updateSettings } = useSettings();
  const [filename, setFilename] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'empty-text' | 'unknown-key' | 'missing-translation'>('all');
  const [showReplace, setShowReplace] = useState(false);
  const [replaceText, setReplaceText] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'hash' | 'key' | 'text', direction: 'asc' | 'desc' } | null>(null);

  const [selectedHash, setSelectedHash] = useState<number | null>(null);
  const [hashToDelete, setHashToDelete] = useState<number | null>(null);
  const [isTranslating, setIsTranslating] = useState<Record<string, boolean>>({});
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState<boolean>(false);
  const [showBatchRenameModal, setShowBatchRenameModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [batchPrefix, setBatchPrefix] = useState<string>('');
  const [batchSuffix, setBatchSuffix] = useState<string>('');
  
  const [selectedHashes, setSelectedHashes] = useState<Set<number>>(new Set());
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isKeyLocked, setIsKeyLocked] = useState<boolean>(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    entries,
    setEntries,
    history,
    historyIndex,
    hasUnsavedChanges,
    pushHistory,
    undo,
    redo,
    resetHistory,
    markSaved
  } = useDatHistory(30);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleUndo = () => {
    const newEntries = undo();
    if (newEntries && selectedHash !== null) {
      const entry = newEntries.find(e => e.hash === selectedHash);
      if (entry) {
        setEditText(entry.text);
        setEditKey(entry.key || '');
      } else {
        setSelectedHash(null);
        setIsNewEntry(false);
      }
    }
  };

  const handleRedo = () => {
    const newEntries = redo();
    if (newEntries && selectedHash !== null) {
      const entry = newEntries.find(e => e.hash === selectedHash);
      if (entry) {
        setEditText(entry.text);
        setEditKey(entry.key || '');
      } else {
        setSelectedHash(null);
        setIsNewEntry(false);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      if (!isInput) {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          } else if (e.key === 'y') {
            e.preventDefault();
            handleRedo();
          } else if (e.key === 'f') {
            e.preventDefault();
            searchInputRef.current?.focus();
          } else if (e.key === 's') {
            e.preventDefault();
            handleSaveDat();
          }
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedHashes.size > 0) {
            e.preventDefault();
            handleBatchDelete();
          } else if (selectedHash !== null) {
            e.preventDefault();
            setHashToDelete(selectedHash);
          }
        }
      } else if (isInput && (e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveDat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, selectedHash, selectedHashes, entries]);

  const handleBatchDelete = () => {
    setShowBatchDeleteModal(true);
  };

  const confirmBatchDelete = () => {
    const newEntries = entries.filter(e => !selectedHashes.has(e.hash));
    pushHistory(newEntries);
    if (selectedHash !== null && selectedHashes.has(selectedHash)) {
      setSelectedHash(null);
    }
    setSelectedHashes(new Set());
    setShowBatchDeleteModal(false);
  };

  const handleBatchRename = () => {
    setBatchPrefix('');
    setBatchSuffix('');
    setShowBatchRenameModal(true);
  };

  const confirmBatchRename = () => {
    let hasChanges = false;
    const newEntries = entries.map(e => {
      if (selectedHashes.has(e.hash)) {
        let newKey = e.key || '';
        if (batchPrefix) newKey = batchPrefix + newKey;
        if (batchSuffix) newKey = newKey + batchSuffix;
        if (newKey !== e.key) {
          hasChanges = true;
          return { ...e, key: newKey, hash: crc32(newKey) };
        }
      }
      return e;
    });

    if (hasChanges) {
      pushHistory(newEntries);
      if (selectedHash !== null && selectedHashes.has(selectedHash)) {
        setSelectedHash(null);
        setIsNewEntry(false);
      }
    }
    
    setSelectedHashes(new Set());
    setShowBatchRenameModal(false);
  };

  const loadedLanguages = useMemo(() => {
    if (entries.length === 0) return [];
    const langsSet = new Set<string>();
    entries.forEach(e => {
      if (e.translations) {
        Object.keys(e.translations).forEach(l => {
          if (l) langsSet.add(l);
        });
      }
    });
    return Array.from(langsSet);
  }, [entries]);

  const handleSelectHash = (hash: number, checked: boolean) => {
    const next = new Set(selectedHashes);
    if (checked) {
      next.add(hash);
    } else {
      next.delete(hash);
    }
    setSelectedHashes(next);
  };

  const handleSelectAll = (checked: boolean, visibleHashes: number[]) => {
    if (checked) {
      const next = new Set(selectedHashes);
      visibleHashes.forEach(h => next.add(h));
      setSelectedHashes(next);
    } else {
      const next = new Set(selectedHashes);
      visibleHashes.forEach(h => next.delete(h));
      setSelectedHashes(next);
    }
  };
  
  // Editor State
  const [editText, setEditText] = useState<string>('');
  const [editTranslations, setEditTranslations] = useState<Record<string, string>>({});
  const [editKey, setEditKey] = useState<string>('');
  const [isNewEntry, setIsNewEntry] = useState<boolean>(false);

  const hashCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of entries) {
      counts.set(e.hash, (counts.get(e.hash) || 0) + 1);
    }
    return counts;
  }, [entries]);

  const currentEditHash = useMemo(() => {
    return editKey.trim() ? crc32(editKey.trim()) : null;
  }, [editKey]);

  const duplicateOf = useMemo(() => {
    if (currentEditHash === null) return null;
    return entries.find(e => e.hash === currentEditHash && (isNewEntry ? true : e.hash !== selectedHash)) || null;
  }, [currentEditHash, entries, isNewEntry, selectedHash]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const translationInputRef = useRef<HTMLInputElement>(null);

  const handleDatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFilename(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseDatFile(arrayBuffer);
      resetHistory(parsed);
      setSelectedHash(null);
    } catch (err) {
      alert("Failed to parse DAT file. Make sure it's a valid Empire at War MasterTextFile.");
      console.error(err);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTranslationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Clean language name from filename (e.g. MasterTextFile_SPANISH.DAT -> SPANISH)
    let langName = file.name
      .replace(/^MasterTextFile_/i, '')
      .replace(/\.dat$/i, '')
      .trim();

    if (!langName) {
      langName = `LANG_${loadedLanguages.length + 1}`;
    }
    langName = langName.toUpperCase();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseDatFile(arrayBuffer);

      if (!parsed || parsed.length === 0) {
        alert("El archivo .DAT de traducción está vacío o corrupto.");
        if (translationInputRef.current) translationInputRef.current.value = '';
        return;
      }
      
      const newEntriesMap = new Map<number, DatEntry>();
      
      // Initialize with existing entries
      entries.forEach(entry => {
        newEntriesMap.set(entry.hash, {
          ...entry,
          translations: { ...(entry.translations || {}) }
        });
      });

      // Process new translations
      parsed.forEach(transEntry => {
        if (newEntriesMap.has(transEntry.hash)) {
          const existing = newEntriesMap.get(transEntry.hash)!;
          existing.translations![langName] = transEntry.text;
        } else {
          // It's a new key that only exists in the translation file
          const newEntry: DatEntry = {
            hash: transEntry.hash,
            key: transEntry.key,
            text: '', // Empty in primary
            originalIndex: newEntriesMap.size,
            translations: { [langName]: transEntry.text }
          };
          // Also backfill empty strings for previously loaded languages
          loadedLanguages.forEach(l => {
            if (l !== langName) {
              newEntry.translations![l] = '';
            }
          });
          newEntriesMap.set(transEntry.hash, newEntry);
        }
      });
      
      // Ensure all existing entries get an empty string for the new language if they weren't in the translation file
      Array.from(newEntriesMap.values()).forEach(entry => {
        if (!entry.translations) {
          entry.translations = {};
        }
        if (entry.translations[langName] === undefined) {
          entry.translations[langName] = '';
        }
      });

      pushHistory(Array.from(newEntriesMap.values()));
    } catch (err) {
      alert("Error al cargar el archivo .DAT de traducción. Asegúrate de que es un archivo MasterTextFile de Empire at War válido.");
      console.error(err);
    }
    if (translationInputRef.current) translationInputRef.current.value = '';
  };

  const handleSaveDat = (targetLanguage?: string) => {
    if (entries.length === 0) return;
    const buffer = writeDatFile(entries, targetLanguage);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    if (targetLanguage) {
       a.download = filename ? filename.replace(/\.dat$/i, `_${targetLanguage}.DAT`) : `MasterTextFile_${targetLanguage}.DAT`;
    } else {
       a.download = filename || 'MasterTextFile_English.DAT';
    }
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (!targetLanguage) markSaved();
  };

  const handleExportCsv = () => {
    if (entries.length === 0) return;
    const csv = Papa.unparse(entries.map(e => {
      const row: Record<string, string> = { Key: e.key || '', 'Text (Primary)': e.text };
      if (e.translations) {
        for (const [lang, val] of Object.entries(e.translations)) {
          row[`Text (${lang})`] = val as string;
        }
      }
      return row;
    }));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filename ? filename.replace('.dat', '') : 'MasterTextFile') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const csvInputRef = useRef<HTMLInputElement>(null);
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newEntries = results.data.map((row, index) => {
          const key = row.Key || '';
          const text = row['Text (Primary)'] || row.Text || '';
          
          const translations: Record<string, string> = {};
          for (const [colName, colVal] of Object.entries(row)) {
            if (colName.startsWith('Text (') && colName !== 'Text (Primary)') {
              const lang = colName.replace('Text (', '').replace(')', '');
              translations[lang] = colVal;
            }
          }

          return {
            hash: crc32(key),
            key: key,
            text: text,
            translations,
            originalIndex: index
          };
        });
        pushHistory(newEntries);
        if (csvInputRef.current) csvInputRef.current.value = '';
      }
    });
  };

  const mergeInputRef = useRef<HTMLInputElement>(null);
  const handleMergeDat = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseDatFile(arrayBuffer);
      
      const newEntries = [...entries];
      for (const p of parsed) {
        const existingIdx = newEntries.findIndex(e => e.hash === p.hash);
        if (existingIdx !== -1) {
          newEntries[existingIdx] = { ...p, originalIndex: newEntries[existingIdx].originalIndex };
        } else {
          newEntries.push({ ...p, originalIndex: newEntries.length });
        }
      }
      pushHistory(newEntries);
    } catch (err) {
      alert("Failed to merge DAT file.");
      console.error(err);
    }
    if (mergeInputRef.current) mergeInputRef.current.value = '';
  };

  const handleReplaceAll = () => {
    if (!search) {
      alert("Please enter a search term first.");
      return;
    }
    
    let modified = false;
    let replacementCount = 0;
    
    const newEntries = entries.map(entry => {
      if (entry.text) {
        const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (regex.test(entry.text)) {
           regex.lastIndex = 0;
           const newText = entry.text.replace(regex, replaceText);
           if (newText !== entry.text) {
             modified = true;
             replacementCount += (entry.text.match(regex) || []).length;
             return { ...entry, text: newText };
           }
        }
      }
      return entry;
    });

    if (modified) {
      pushHistory(newEntries);
      alert(`Replaced ${replacementCount} occurrence(s).`);
    } else {
      alert("No matches found to replace.");
    }
  };

  const handleSort = (key: 'hash' | 'key' | 'text') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const deferredSearch = useDeferredValue(search);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (filterMode === 'empty-text') {
      result = result.filter(e => !e.text || e.text.trim() === '');
    } else if (filterMode === 'unknown-key') {
      result = result.filter(e => !e.key);
    } else if (filterMode === 'missing-translation') {
      result = result.filter(e => {
        if (!e.text) return true;
        if (loadedLanguages.length > 0) {
          return loadedLanguages.some(lang => !e.translations || !e.translations[lang] || e.translations[lang].trim() === '');
        }
        return false;
      });
    }

    if (deferredSearch) {
      const lowerSearch = deferredSearch.toLowerCase();
      result = result.filter(e => {
        const key = e.key || '';
        const hex = e.hash.toString(16).padStart(8, '0').toUpperCase();
        return (
          e.text.toLowerCase().includes(lowerSearch) ||
          key.toLowerCase().includes(lowerSearch) ||
          hex.includes(lowerSearch) ||
          e.hash.toString().includes(lowerSearch)
        );
      });
    }

    if (sortConfig !== null) {
      result = [...result].sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';
        
        if (sortConfig.key === 'hash') {
          aValue = a.hash;
          bValue = b.hash;
        } else if (sortConfig.key === 'key') {
          aValue = (a.key || '').toLowerCase();
          bValue = (b.key || '').toLowerCase();
        } else if (sortConfig.key === 'text') {
          aValue = (a.text || '').toLowerCase();
          bValue = (b.text || '').toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return result;
  }, [entries, deferredSearch, filterMode, sortConfig]);

  const selectEntry = (hash: number) => {
    const entry = entries.find(e => e.hash === hash);
    if (entry) {
      setSelectedHash(hash);
      setEditText(entry.text);
      const trans: Record<string, string> = {};
      loadedLanguages.forEach(lang => {
        trans[lang] = entry.translations?.[lang] || '';
      });
      setEditTranslations(trans);
      setEditKey(entry.key || '');
      setIsNewEntry(false);
      setSaveError(null);
    }
  };

  const startNewEntry = () => {
    setSelectedHash(null);
    setEditText('');
    const trans: Record<string, string> = {};
    loadedLanguages.forEach(lang => {
      trans[lang] = '';
    });
    setEditTranslations(trans);
    setEditKey('');
    setIsNewEntry(true);
    setSaveError(null);
  };

  const saveEntry = () => {
    setSaveError(null);
    let hashVal = selectedHash;

    if (isNewEntry) {
      if (!editKey.trim()) {
        setSaveError(t(settings.language, 'keyRequired'));
        return;
      }
      hashVal = crc32(editKey.trim().toUpperCase());
    } else {
      if (editKey.trim()) {
        hashVal = crc32(editKey.trim().toUpperCase());
      }
    }

    if (hashVal === null) return;

    if (isNewEntry) {
      if (entries.some(e => e.hash === hashVal)) {
        setSaveError(t(settings.language, 'keyExists'));
        return;
      }
      const newEntries = [...entries, { hash: hashVal, key: editKey.trim().toUpperCase(), text: editText, translations: editTranslations, originalIndex: entries.length }];
      pushHistory(newEntries);
      setIsNewEntry(false);
      setSelectedHash(null);
    } else {
      const newEntries = entries.map(e => {
        if (e.hash === selectedHash) {
          return { ...e, hash: hashVal, key: editKey.trim().toUpperCase(), text: editText, translations: editTranslations };
        }
        return e;
      });
      pushHistory(newEntries);
      setIsNewEntry(false);
      setSelectedHash(null);
    }
  };

  const handleDeleteEntry = (hash: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHashToDelete(hash);
  };

  const confirmDelete = () => {
    if (hashToDelete !== null) {
      const newEntries = entries.filter(e => e.hash !== hashToDelete);
      pushHistory(newEntries);
      if (selectedHash === hashToDelete) setSelectedHash(null);
      setHashToDelete(null);
    }
  };

  // Remove displayLimit to show all results as requested
  
  const missingTransCount = useMemo(() => {
    if (loadedLanguages.length === 0) return 0;
    return entries.filter(e => loadedLanguages.some(lang => !e.translations?.[lang] || e.translations[lang].trim() === '')).length;
  }, [entries, loadedLanguages]);

  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // estimated height of row
    overscan: 5,
  });

  const handleFileDrop = (file: File) => {
    if (file.name.toLowerCase().endsWith('.dat')) {
      if (entries.length === 0 || file.name.toLowerCase().includes('mastertextfile_english')) {
        // Load as main if empty
        const syntheticEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleDatUpload(syntheticEvent);
      } else {
        // Load as translation
        const syntheticEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleTranslationUpload(syntheticEvent);
      }
    } else if (file.name.toLowerCase().endsWith('.csv')) {
      const syntheticEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleImportCsv(syntheticEvent);
    }
  };

  const { isDragging } = useDragAndDrop(handleFileDrop);

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors duration-200 ${isDragging ? 'bg-blue-50 dark:bg-blue-950 ring-4 ring-inset ring-blue-500' : 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100'}`}>
      {isDragging && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border-2 border-blue-500">
            <Upload size={48} className="text-blue-500 animate-bounce" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center">Suelta tu archivo aquí</h2>
            <p className="text-slate-500 dark:text-slate-400 text-center">Admite .DAT principales, traducciones .DAT y exportaciones .CSV</p>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-20 gap-4">
        <div className="flex items-center gap-3.5">
          {/* Custom Cyan Diamond .DAT Icon matching reference */}
          <div className="w-10 h-10 bg-cyan-400 dark:bg-cyan-500 rounded-xl flex items-center justify-center shadow-md shadow-cyan-500/20 border border-cyan-300 dark:border-cyan-400 flex-shrink-0 transition-transform hover:scale-105">
            <svg viewBox="0 0 36 36" className="w-7 h-7 text-slate-950 stroke-[2.5]" fill="none" stroke="currentColor">
              {/* Outer diamond frame */}
              <polygon points="18,3 33,18 18,33 3,18" strokeWidth="2.5" strokeLinejoin="round" />
              {/* .DAT label inside diamond */}
              <text x="18" y="21" textAnchor="middle" fill="currentColor" stroke="none" className="text-[9px] font-black tracking-tighter font-mono uppercase">.DAT</text>
            </svg>
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
              <span className="text-xl sm:text-2xl font-black italic tracking-wider text-slate-900 dark:text-white uppercase">
                CORVUS
              </span>
              <span className="text-slate-400 dark:text-slate-500 font-light italic text-xl sm:text-2xl select-none">
                //
              </span>
              <span className="text-slate-600 dark:text-slate-300 font-light italic tracking-widest text-lg sm:text-xl uppercase">
                DAT EDITOR
              </span>

              {/* Silver Metallic Version Tag */}
              <span className="ml-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold tracking-tight bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-300 shadow-xs"></span>
                v2.4.0
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-2">
              {filename ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                  {t(settings.language, 'loadedFile')} <span className="text-slate-700 dark:text-slate-300 font-semibold">{filename}</span> ({entries.length} {t(settings.language, 'stringsCount')})
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                  {t(settings.language, 'noFileLoaded')}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
          <div className="flex gap-1 border-r border-slate-200 dark:border-slate-800 pr-3 mr-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-lg">
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md shadow-sm transition-all flex items-center gap-1 font-semibold text-xs"
              title={t(settings.language, 'userGuide')}
            >
              <HelpCircle size={18} />
              <span className="hidden md:inline">{t(settings.language, 'userGuide')}</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 rounded-md shadow-sm transition-all"
              title={t(settings.language, 'settings')}
            >
              <SettingsIcon size={18} />
            </button>
            <button
              onClick={() => setShowStats(true)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 rounded-md shadow-sm transition-all"
              title={t(settings.language, 'statsTitle')}
            >
              <BarChart2 size={18} />
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 rounded-md shadow-sm transition-all"
              title={isDarkMode ? t(settings.language, 'switchToLightMode') : t(settings.language, 'switchToDarkMode')}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          
          <div className="flex gap-1 border-r border-slate-200 dark:border-slate-800 pr-3 mr-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-lg hidden sm:flex">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-md shadow-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none transition-all"
              title={t(settings.language, 'shortcutUndo')}
            >
              <Undo size={18} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-md shadow-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none transition-all"
              title={t(settings.language, 'shortcutRedo')}
            >
              <Redo size={18} />
            </button>
          </div>

          <input
            type="file"
            accept=".dat,.DAT"
            className="hidden"
            ref={fileInputRef}
            onChange={handleDatUpload}
          />
          <input
            type="file"
            accept=".csv,.CSV"
            className="hidden"
            ref={csvInputRef}
            onChange={handleImportCsv}
          />
          <input
            type="file"
            accept=".dat,.DAT"
            className="hidden"
            ref={mergeInputRef}
            onChange={handleMergeDat}
          />
          <input
            type="file"
            accept=".dat,.DAT"
            className="hidden"
            ref={translationInputRef}
            onChange={handleTranslationUpload}
          />

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg gap-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 rounded-md shadow-sm transition-all text-slate-800 dark:text-slate-200"
              title={t(settings.language, 'loadDat')}
            >
              <Upload size={15} />
              <span>{t(settings.language, 'loadDat')}</span>
            </button>
            <button
              onClick={() => {
                if (entries.length === 0) {
                  alert("Primero debes cargar el archivo .DAT principal (por ejemplo MasterTextFile_ENGLISH.DAT) antes de añadir traducciones secundarias.");
                  fileInputRef.current?.click();
                  return;
                }
                translationInputRef.current?.click();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60 rounded-md transition-all border border-purple-200 dark:border-purple-800/60 shadow-sm cursor-pointer"
              title="Añadir traducción secundaria (.DAT)"
            >
              <Globe size={15} />
              <span>{t(settings.language, 'addLanguage')}</span>
            </button>
            <button
              onClick={() => csvInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-slate-900 rounded-md transition-all text-slate-700 dark:text-slate-300"
              title={t(settings.language, 'importCsv')}
            >
              <FileUp size={15} />
              <span className="hidden sm:inline">{t(settings.language, 'importCsv')}</span>
            </button>
            <button
              onClick={() => mergeInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-slate-900 rounded-md transition-all text-slate-700 dark:text-slate-300"
              title={t(settings.language, 'mergeDat')}
              disabled={entries.length === 0}
            >
              <GitMerge size={15} />
              <span className="hidden xl:inline">{t(settings.language, 'mergeDat')}</span>
            </button>
          </div>

          <div className="flex bg-blue-50 dark:bg-blue-900/20 p-1 rounded-lg gap-1 border border-blue-100 dark:border-blue-900/50">
            <button
              onClick={() => handleSaveDat()}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:hover:bg-blue-600 disabled:cursor-not-allowed rounded-md shadow-sm shadow-blue-600/20 transition-all"
              title={t(settings.language, 'saveDat')}
            >
              <Download size={15} />
              <span>{t(settings.language, 'saveDat')}</span>
              {hasUnsavedChanges ? <span className="ml-1 w-2 h-2 rounded-full bg-red-400"></span> : null}
            </button>
            {Object.keys(entries[0]?.translations || {}).map(lang => (
              <button
                key={lang}
                onClick={() => handleSaveDat(lang)}
                disabled={entries.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm transition-all"
                title={`Guardar archivo traducido ${lang} .DAT`}
              >
                <Download size={15} />
                <span>.DAT ({lang})</span>
              </button>
            ))}
            <button
              onClick={handleExportCsv}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-all"
              title={t(settings.language, 'exportCsv')}
            >
              <FileDown size={15} />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col flex-1 overflow-hidden relative p-4 md:p-6 lg:p-8">
        {/* Active Multi-Language & KPI Status Dashboard Banner */}
        {entries.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 px-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                <Globe size={15} className="text-purple-500" />
                {t(settings.language, 'activeLanguages')}:
              </span>
              <span className="bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-mono font-semibold px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/60 flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Primary ({filename || 'DAT'})
              </span>
              {loadedLanguages.map(lang => (
                <span key={lang} className="bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-mono font-semibold px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800/60 flex items-center gap-2 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  {lang}
                  <button onClick={() => handleSaveDat(lang)} className="p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800/60 rounded transition-colors text-purple-800 dark:text-purple-200" title={`Guardar ${lang} .DAT`}>
                    <Download size={13} />
                  </button>
                </span>
              ))}
              <button
                onClick={() => translationInputRef.current?.click()}
                className="text-xs font-bold text-purple-600 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-100 bg-purple-50/80 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 px-3 py-1.5 rounded-lg border border-dashed border-purple-300 dark:border-purple-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={14} />
                {t(settings.language, 'addLanguage')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <div className="bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                <span className="font-bold text-slate-900 dark:text-white">{entries.length}</span> {t(settings.language, 'stringsCount')}
              </div>
              {loadedLanguages.length > 0 && (
                <button
                  onClick={() => setFilterMode(filterMode === 'missing-translation' ? 'all' : 'missing-translation')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 font-bold cursor-pointer ${filterMode === 'missing-translation' ? 'bg-amber-500 text-white shadow-md' : missingTransCount > 0 ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-200 dark:hover:bg-amber-900/70' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'}`}
                  title="Haz clic para alternar el filtro de traducciones faltantes"
                >
                  <AlertCircle size={14} />
                  <span>{missingTransCount} {t(settings.language, 'filterMissingTrans')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Panel: Table */}
        <div className="w-full flex flex-col bg-white dark:bg-slate-900 h-full rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="flex gap-2 w-full sm:w-auto flex-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder={t(settings.language, 'searchPlaceholder')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400 text-sm shadow-sm transition-shadow"
                  />
                </div>
                <button
                  onClick={() => setShowReplace(!showReplace)}
                  className={`flex items-center justify-center p-2 border rounded-lg shadow-sm transition-all text-sm font-medium ${showReplace ? 'bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  title="Toggle Find & Replace"
                >
                  <ArrowRightLeft size={18} />
                </button>
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as any)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-slate-700 dark:text-slate-300 shadow-sm"
                >
                  <option value="all">{t(settings.language, 'allEntries')}</option>
                  <option value="empty-text">{t(settings.language, 'emptyText')}</option>
                  <option value="unknown-key">{t(settings.language, 'unknownKeys')}</option>
                  {loadedLanguages.length > 0 && (
                    <option value="missing-translation">{t(settings.language, 'filterMissingTrans')}</option>
                  )}
                </select>
              </div>
              {selectedHashes.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleBatchRename}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2 bg-indigo-600 dark:bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors text-sm font-semibold shadow-sm"
                  >
                    <FileEdit size={16} />
                    {t(settings.language, 'batchRenameButton')} ({selectedHashes.size})
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2 bg-red-600 dark:bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors text-sm font-semibold shadow-sm"
                  >
                    <Trash2 size={16} />
                    {t(settings.language, 'delete')} ({selectedHashes.size})
                  </button>
                </div>
              )}
              <button
                onClick={startNewEntry}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 rounded-lg transition-colors text-sm font-semibold shadow-sm"
              >
                <Plus size={16} />
                {t(settings.language, 'addString')}
              </button>
            </div>
            {showReplace && (
              <div className="flex flex-col sm:flex-row gap-2 mt-1 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                <input
                  type="text"
                  placeholder={t(settings.language, 'replaceWith')}
                  value={replaceText}
                  onChange={e => setReplaceText(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                />
                <button
                  onClick={handleReplaceAll}
                  disabled={!search}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:hover:bg-amber-500 disabled:cursor-not-allowed rounded-md shadow-sm transition-all text-sm font-medium whitespace-nowrap"
                >
                  {t(settings.language, 'replaceAll')}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto" ref={parentRef}>
            {filteredEntries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8">
                <BookOpen size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {entries.length === 0 ? t(settings.language, 'emptyDat') : 'No Results Found'}
                </p>
                <p className="text-sm">
                  {entries.length === 0 ? t(settings.language, 'emptyDatDesc') : 'Try adjusting your search or filters.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm table-fixed block">
                <thead className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 shadow-sm block w-full">
                  <tr className="flex w-full">
                    <th className="p-4 w-12 text-center flex-shrink-0">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const visibleHashes = filteredEntries.map(e => e.hash);
                          const allSelected = visibleHashes.every(h => selectedHashes.has(h));
                          handleSelectAll(!allSelected, visibleHashes);
                        }}
                        className="text-slate-400 hover:text-blue-500 transition-colors"
                      >
                        {filteredEntries.every(e => selectedHashes.has(e.hash)) && filteredEntries.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                    <th className="p-4 w-28 whitespace-nowrap text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold flex-shrink-0">{t(settings.language, 'actions')}</th>
                    <th 
                      className="p-4 w-1/3 flex-shrink-0 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => handleSort('key')}
                    >
                      <div className="flex items-center gap-1">
                        {t(settings.language, 'keyHash')}
                        {sortConfig?.key === 'key' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        ) : sortConfig?.key === 'hash' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        ) : null}
                      </div>
                    </th>
                    <th 
                      className="p-4 flex-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => handleSort('text')}
                    >
                      <div className="flex items-center gap-1">
                        {t(settings.language, 'textValue')} {loadedLanguages.length > 0 && '(Primary)'}
                        {sortConfig?.key === 'text' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        ) : null}
                      </div>
                    </th>
                    {loadedLanguages.map(lang => (
                      <th key={lang} className="p-4 flex-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                        {lang}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 block w-full relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                  {rowVirtualizer.getVirtualItems().map(virtualRow => {
                    const entry = filteredEntries[virtualRow.index];
                    const key = entry.key;
                    const isSelected = selectedHash === entry.hash;
                    const isChecked = selectedHashes.has(entry.hash);
                    const isEmptyText = !entry.text || entry.text.trim() === '';
                    
                    const normalColorClass = getColorClasses(settings.normalKeyColor);
                    const emptyColorClass = getColorClasses(settings.emptyTextKeyColor);

                    const isIntrinsicDuplicate = (hashCounts.get(entry.hash) || 0) > 1;
                    const isCollisionTarget = currentEditHash !== null && entry.hash === currentEditHash && (isNewEntry || entry.hash !== selectedHash);
                    const isWarning = isIntrinsicDuplicate || isCollisionTarget;
                    
                    let bgClass = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30';
                    if (isSelected || isChecked) {
                      bgClass = 'bg-blue-50/50 dark:bg-blue-900/10';
                    } else if (isWarning) {
                      bgClass = 'bg-red-50/80 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40';
                    }

                    return (
                      <tr
                        key={`${entry.hash}-${entry.originalIndex}`}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        onClick={() => selectEntry(entry.hash)}
                        className={`absolute top-0 left-0 w-full flex cursor-pointer transition-all group ${bgClass} ${isWarning ? 'ring-inset ring-2 ring-red-400 dark:ring-red-500/50 z-10' : ''}`}
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <td className="p-4 w-12 flex-shrink-0 text-center flex items-start justify-center pt-5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectHash(entry.hash, !isChecked);
                            }}
                            className={`transition-colors ${isChecked ? 'text-blue-500' : 'text-slate-400 hover:text-blue-400'}`}
                          >
                            {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="p-4 w-28 flex-shrink-0 align-top">
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                selectEntry(entry.hash);
                              }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title={t(settings.language, 'editEntry')}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteEntry(entry.hash, e)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:hover:text-red-400 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title={t(settings.language, 'delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 w-1/3 flex-shrink-0 align-top">
                          <div className="flex flex-col gap-1.5">
                            {key ? (
                              <span className={`font-mono font-medium break-all px-2 py-0.5 rounded text-xs w-fit ${isEmptyText ? emptyColorClass : normalColorClass}`}>{key}</span>
                            ) : (
                              <span className="font-mono text-slate-400 italic text-xs px-2 py-0.5">{t(settings.language, 'unknownKey')}</span>
                            )}
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 px-2">
                              0x{entry.hash.toString(16).padStart(8, '0').toUpperCase()}
                            </span>
                            {loadedLanguages.length > 0 && (
                              <div className="flex gap-1 mt-1 px-2 flex-wrap">
                                {loadedLanguages.map(lang => {
                                  const hasTrans = !!entry.translations?.[lang] && entry.translations[lang].trim() !== '';
                                  return (
                                    <span key={lang} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase ${hasTrans ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
                                      {lang.substring(0, 3)}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 flex-1 break-words align-top">
                          <div className="text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
                            {entry.text || <span className="text-slate-400 italic">{t(settings.language, 'emptyString')}</span>}
                          </div>
                        </td>
                        {loadedLanguages.map(lang => (
                          <td key={lang} className="p-4 flex-1 break-words align-top border-l border-slate-100 dark:border-slate-800/60">
                            <div className="text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
                              {entry.translations?.[lang] || <span className="text-slate-400 italic">{t(settings.language, 'emptyString')}</span>}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Modal Editor */}
      {(selectedHash !== null || isNewEntry) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col h-full overflow-y-auto p-6 md:p-8">
              <div className="w-full flex flex-col gap-6">
                <div>
                  <button 
                    onClick={() => { setSelectedHash(null); setIsNewEntry(false); }}
                    className="mb-4 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1.5 font-medium transition-colors w-fit"
                  >
                    &larr; {t(settings.language, 'backToList')}
                  </button>
                  <h2 className="text-2xl font-bold mb-1 text-slate-900 dark:text-white">
                    {isNewEntry ? t(settings.language, 'newEntry') : t(settings.language, 'editEntry')}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {isNewEntry ? t(settings.language, 'newEntryDesc') : t(settings.language, 'editEntryDesc')}
                  </p>
                </div>

                {saveError && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800">
                    {saveError}
                  </div>
                )}

                <div className="space-y-5 bg-slate-50/50 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                        {t(settings.language, 'stringKey')}
                      </label>
                      <button
                        onClick={() => setIsKeyLocked(!isKeyLocked)}
                        className={`text-xs flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-md transition-colors ${isKeyLocked ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}
                        title={t(settings.language, 'lockKeyHint')}
                      >
                        {isKeyLocked ? <Lock size={14} /> : <Unlock size={14} />}
                        {isKeyLocked ? 'Locked' : 'Unlocked'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editKey}
                      disabled={isKeyLocked && !isNewEntry}
                      onChange={(e) => {
                        let val = e.target.value;
                        val = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        val = val.replace(/\s+/g, "_");
                        val = val.replace(/[^a-zA-Z0-9_]/g, "");
                        val = val.toUpperCase();
                        setEditKey(val);
                        setSaveError(null);
                      }}
                      placeholder={t(settings.language, 'stringKeyPlaceholder')}
                      className={`w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono text-sm text-slate-900 dark:text-white shadow-sm transition-all ${isKeyLocked && !isNewEntry ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800' : ''}`}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      {t(settings.language, 'eawKeyHint')}
                    </p>
                    {duplicateOf && (
                      <div className="mt-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 p-2.5 rounded-lg text-sm font-medium border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                        {t(settings.language, 'keyExists')}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                        {t(settings.language, 'textValue')} (Primary)
                      </label>
                      <button
                        onClick={() => {
                          const textarea = document.getElementById('edit-textarea') as HTMLTextAreaElement;
                          if (textarea) {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const newText = editText.substring(0, start) + '\\n' + editText.substring(end);
                            setEditText(newText);
                            setTimeout(() => {
                              textarea.focus();
                              textarea.setSelectionRange(start + 2, start + 2);
                            }, 0);
                          } else {
                            setEditText(editText + '\\n');
                          }
                        }}
                        className="text-xs flex items-center gap-1 font-medium bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 transition-colors"
                        title={t(settings.language, 'insertNewline')}
                      >
                        <CornerDownLeft size={14} />
                        \\n
                      </button>
                    </div>
                    <textarea
                      id="edit-textarea"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-sans resize-y text-slate-900 dark:text-white shadow-sm transition-all leading-relaxed"
                      placeholder={t(settings.language, 'textPlaceholder')}
                    />
                  </div>

                  {Object.keys(editTranslations).map(lang => (
                    <div key={lang} className="space-y-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                          {lang}
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              if (!editText.trim()) return;
                              setIsTranslating(prev => ({ ...prev, [lang]: true }));
                              try {
                                const res = await fetch('/api/translate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: editText, targetLanguage: lang })
                                });
                                if (!res.ok) throw new Error('Translation failed');
                                const data = await res.json();
                                setEditTranslations({ ...editTranslations, [lang]: data.translation });
                              } catch (err) {
                                alert('Error al traducir: ' + (err as Error).message);
                              } finally {
                                setIsTranslating(prev => ({ ...prev, [lang]: false }));
                              }
                            }}
                            className="text-xs flex items-center gap-1 font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 hover:bg-cyan-200 dark:hover:bg-cyan-900/60 px-2.5 py-1 rounded-md transition-colors"
                            title="Traducir con IA"
                            disabled={!editText.trim() || isTranslating[lang]}
                          >
                            <Sparkles size={14} className={isTranslating[lang] ? "animate-spin" : ""} />
                            {isTranslating[lang] ? "Traduciendo..." : "Traducir con IA"}
                          </button>
                          <button
                            onClick={() => {
                              const textarea = document.getElementById(`edit-textarea-${lang}`) as HTMLTextAreaElement;
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const currentVal = editTranslations[lang] || '';
                                const newText = currentVal.substring(0, start) + '\\n' + currentVal.substring(end);
                                setEditTranslations({ ...editTranslations, [lang]: newText });
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + 2, start + 2);
                                }, 0);
                              }
                            }}
                            className="text-xs flex items-center gap-1 font-medium bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 transition-colors"
                            title={t(settings.language, 'insertNewline')}
                          >
                            <CornerDownLeft size={14} />
                            \\n
                          </button>
                        </div>
                      </div>
                      <textarea
                        id={`edit-textarea-${lang}`}
                        value={editTranslations[lang] || ''}
                        onChange={e => setEditTranslations({ ...editTranslations, [lang]: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-sans resize-y text-slate-900 dark:text-white shadow-sm transition-all leading-relaxed"
                        placeholder={`${lang} translation...`}
                      />
                    </div>
                  ))}

                </div>

                <div className="flex justify-end items-center pt-2 mt-2">
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setSelectedHash(null);
                        setIsNewEntry(false);
                      }}
                      className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      {t(settings.language, 'cancel')}
                    </button>
                    <button
                      onClick={saveEntry}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-600/20 transition-all"
                    >
                      <Save size={18} />
                      {t(settings.language, 'saveEntry')}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {hashToDelete !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm flex flex-col p-6 sm:p-8 transform scale-100">
            <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">{t(settings.language, 'deleteEntryTitle')}</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm leading-relaxed">
              {t(settings.language, 'deleteEntryDesc')}
            </p>
            <div className="flex justify-end gap-3 w-full">
              <button
                onClick={() => setHashToDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t(settings.language, 'cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-red-600/20 transition-all"
              >
                {t(settings.language, 'delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm flex flex-col p-6 sm:p-8 transform scale-100">
            <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">{t(settings.language, 'deleteBatchTitle', { count: selectedHashes.size })}</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm leading-relaxed">
              {t(settings.language, 'deleteBatchDesc', { count: selectedHashes.size })}
            </p>
            <div className="flex justify-end gap-3 w-full">
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t(settings.language, 'cancel')}
              </button>
              <button
                onClick={confirmBatchDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-red-600/20 transition-all"
              >
                {t(settings.language, 'deleteAll')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md flex flex-col p-6 sm:p-8 transform scale-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                <BarChart2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t(settings.language, 'statsTitle')}</h3>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t(settings.language, 'totalEntries')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{entries.length}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t(settings.language, 'emptyText')} (Primary)</span>
                <span className="font-semibold text-slate-900 dark:text-white">{entries.filter(e => !e.text || e.text.trim() === '').length}</span>
              </div>
              {loadedLanguages.length > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t(settings.language, 'filterMissingTrans')}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{entries.filter(e => {
                    return loadedLanguages.some(lang => !e.translations || !e.translations[lang] || e.translations[lang].trim() === '');
                  }).length}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t(settings.language, 'unknownKeys')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{entries.filter(e => !e.key).length}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t(settings.language, 'uniqueStrings')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{new Set(entries.map(e => e.text)).size}</span>
              </div>
            </div>
            
            <button
              onClick={() => setShowStats(false)}
              className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors"
            >
              {t(settings.language, 'close')}
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl flex flex-col p-6 sm:p-8 transform scale-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg">
                <SettingsIcon size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t(settings.language, 'settings')}</h3>
            </div>
            
            <div className="space-y-8 mb-8">
              {/* Language Section */}
              <section className="space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t(settings.language, 'language')}</h4>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => updateSettings({ language: 'en' })} className={`p-3 rounded-lg border text-sm font-medium transition-all ${settings.language === 'en' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>English</button>
                  <button onClick={() => updateSettings({ language: 'es' })} className={`p-3 rounded-lg border text-sm font-medium transition-all ${settings.language === 'es' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>Español</button>
                  <button onClick={() => updateSettings({ language: 'fr' })} className={`p-3 rounded-lg border text-sm font-medium transition-all ${settings.language === 'fr' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>Français</button>
                </div>
              </section>

              {/* Colors Section */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t(settings.language, 'keyTagColors')}</h4>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t(settings.language, 'normalKeyColor')}</span>
                    <select
                      value={settings.normalKeyColor}
                      onChange={(e) => updateSettings({ normalKeyColor: e.target.value })}
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                    >
                      {colorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t(settings.language, 'emptyTextKeyColor')}</span>
                    <select
                      value={settings.emptyTextKeyColor}
                      onChange={(e) => updateSettings({ emptyTextKeyColor: e.target.value })}
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                    >
                      {colorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Keyboard Shortcuts Overview */}
              <section className="space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t(settings.language, 'keyboardShortcuts')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded"><span>{t(settings.language, 'shortcutUndo')}</span><kbd className="font-mono text-xs font-semibold">Ctrl + Z</kbd></div>
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded"><span>{t(settings.language, 'shortcutRedo')}</span><kbd className="font-mono text-xs font-semibold">Ctrl + Shift + Z / Ctrl + Y</kbd></div>
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded"><span>{t(settings.language, 'shortcutSave')}</span><kbd className="font-mono text-xs font-semibold">Ctrl + S</kbd></div>
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded"><span>{t(settings.language, 'shortcutSearch')}</span><kbd className="font-mono text-xs font-semibold">Ctrl + F</kbd></div>
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded"><span>{t(settings.language, 'shortcutDelete')}</span><kbd className="font-mono text-xs font-semibold">Del / Backspace</kbd></div>
                </div>
              </section>
            </div>
            
            <button
              onClick={() => setShowSettings(false)}
              className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors mt-auto"
            >
              {t(settings.language, 'close')}
            </button>
          </div>
        </div>
      )}
      {showBatchRenameModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <FileEdit className="text-indigo-500" size={24} />
              {t(settings.language, 'batchRenameTitle').replace('{count}', selectedHashes.size.toString())}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              {t(settings.language, 'batchRenameDesc')}
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prefix</label>
                <input
                  type="text"
                  value={batchPrefix}
                  onChange={e => setBatchPrefix(e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''))}
                  placeholder={t(settings.language, 'prefixPlaceholder')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Suffix</label>
                <input
                  type="text"
                  value={batchSuffix}
                  onChange={e => setBatchSuffix(e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''))}
                  placeholder={t(settings.language, 'suffixPlaceholder')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end w-full">
              <button
                onClick={() => setShowBatchRenameModal(false)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t(settings.language, 'cancel')}
              </button>
              <button
                onClick={confirmBatchRename}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
              >
                {t(settings.language, 'apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help / User Guide Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 rounded-xl">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t(settings.language, 'helpTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Guía rápida de funcionalidades
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-slate-700 dark:text-slate-300 text-sm">
              <div className="p-4 bg-purple-50/80 dark:bg-purple-950/30 rounded-2xl border border-purple-200/80 dark:border-purple-900/50 space-y-2">
                <h4 className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2 text-base">
                  <Globe size={18} className="text-purple-600 dark:text-purple-400" />
                  {t(settings.language, 'helpMultiLangTitle')}
                </h4>
                <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                  {t(settings.language, 'helpMultiLangDesc')}
                </p>
              </div>

              <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 space-y-2">
                <h4 className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 text-base">
                  <FileEdit size={18} className="text-indigo-600 dark:text-indigo-400" />
                  {t(settings.language, 'helpBatchTitle')}
                </h4>
                <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                  {t(settings.language, 'helpBatchDesc')}
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                  <Lock size={18} className="text-slate-600 dark:text-slate-400" />
                  {t(settings.language, 'helpLockTitle')}
                </h4>
                <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                  {t(settings.language, 'helpLockDesc')}
                </p>
              </div>

              <div className="p-4 bg-blue-50/80 dark:bg-blue-950/30 rounded-2xl border border-blue-200/80 dark:border-blue-900/50 space-y-2">
                <h4 className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2 text-base">
                  <FileSpreadsheet size={18} className="text-blue-600 dark:text-blue-400" />
                  {t(settings.language, 'helpCsvTitle')}
                </h4>
                <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                  {t(settings.language, 'helpCsvDesc')}
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-indigo-600/20"
              >
                {t(settings.language, 'close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
