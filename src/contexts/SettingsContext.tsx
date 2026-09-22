import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '../lib/i18n';

interface Settings {
  language: Language;
  normalKeyColor: string;
  emptyTextKeyColor: string;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
  language: 'es',
  normalKeyColor: 'emerald', // We can store color names: emerald, blue, purple, etc.
  emptyTextKeyColor: 'red',
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('datEditorSettings');
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('datEditorSettings', JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export const colorOptions = [
  { value: 'emerald', label: 'Emerald', classes: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10' },
  { value: 'red', label: 'Red', classes: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10' },
  { value: 'blue', label: 'Blue', classes: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10' },
  { value: 'purple', label: 'Purple', classes: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-400/10' },
  { value: 'amber', label: 'Amber', classes: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10' },
  { value: 'slate', label: 'Slate', classes: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-400/10' },
];

export function getColorClasses(colorName: string): string {
  const option = colorOptions.find(o => o.value === colorName);
  return option ? option.classes : colorOptions[0].classes;
}
