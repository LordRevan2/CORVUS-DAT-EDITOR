import re

with open('src/components/DatEditor.tsx', 'r') as f:
    content = f.read()

# Mappings of dark mode classes (current) to light mode equivalents.
# We will transform "bg-slate-900" to "bg-white dark:bg-slate-900"
# "text-slate-100" to "text-slate-900 dark:text-slate-100"

replacements = {
    'bg-slate-900': 'bg-white dark:bg-slate-900',
    'bg-slate-800': 'bg-slate-50 dark:bg-slate-800',
    'bg-slate-800/50': 'bg-slate-50/50 dark:bg-slate-800/50',
    'bg-slate-700': 'bg-slate-200 dark:bg-slate-700',
    'bg-slate-700/50': 'bg-slate-200/50 dark:bg-slate-700/50',
    'hover:bg-slate-700/50': 'hover:bg-slate-100 dark:hover:bg-slate-700/50',
    'hover:bg-slate-600': 'hover:bg-slate-300 dark:hover:bg-slate-600',
    
    'text-slate-100': 'text-slate-900 dark:text-slate-100',
    'text-white': 'text-slate-900 dark:text-white',
    'text-slate-300': 'text-slate-700 dark:text-slate-300',
    'text-slate-400': 'text-slate-600 dark:text-slate-400',
    'text-slate-500': 'text-slate-500 dark:text-slate-400', # Maybe just keep text-slate-500? Actually let's use text-slate-500 for light and dark:text-slate-400
    
    'border-slate-700': 'border-slate-200 dark:border-slate-700',
    'border-slate-700/50': 'border-slate-200 dark:border-slate-700/50',
    'border-slate-600': 'border-slate-300 dark:border-slate-600',
    
    'divide-slate-700/50': 'divide-slate-200 dark:divide-slate-700/50',
}

# Note: We have to be careful with substrings (e.g. bg-slate-900 vs bg-slate-900/50)
# Sort by length descending to match longest first
for old_cls in sorted(replacements.keys(), key=len, reverse=True):
    new_cls = replacements[old_cls]
    # Use regex to replace only whole words
    # negative lookbehind to avoid replacing already transformed parts
    content = re.sub(r'(?<!dark:)\b' + re.escape(old_cls) + r'\b', new_cls, content)

with open('src/components/DatEditor.tsx', 'w') as f:
    f.write(content)

