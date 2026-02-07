import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface SimpleEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    placeholder?: string;
    style?: React.CSSProperties;
    errorLine?: number | null;
    highlightLines?: number[]; // indices 1-based
    schema?: any; // { tableName: { columns: [...], ... } }
    onExecute?: () => void;
}

interface Suggestion {
    label: string;
    detail?: string;
    type: 'column' | 'table';
}

const SimpleEditor: React.FC<SimpleEditorProps> = ({
    value, onChange, language = 'sql', placeholder, style, errorLine, highlightLines = [], schema, onExecute
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const codeRef = useRef<HTMLDivElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Completion state
    const [showDropdown, setShowDropdown] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]); // Unfiltered list
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [triggerInfo, setTriggerInfo] = useState<{ start: number; type: 'column' | 'table' } | null>(null);

    // Parse aliases from SQL
    const parseAliases = useCallback((sql: string): Record<string, string> => {
        const aliasMap: Record<string, string> = {};
        if (!sql) return aliasMap;
        const regex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\b/gi;
        let match;
        while ((match = regex.exec(sql)) !== null) {
            const tableName = match[1];
            const alias = match[2];
            if (alias && tableName) {
                aliasMap[alias.toLowerCase()] = tableName.toLowerCase();
            }
            if (tableName) {
                aliasMap[tableName.toLowerCase()] = tableName.toLowerCase();
            }
        }
        return aliasMap;
    }, []);

    // Get columns for a table
    const getColumnsForTable = useCallback((tableName: string): Suggestion[] => {
        if (!schema) return [];
        const tableKey = Object.keys(schema).find(k => k.toLowerCase() === tableName.toLowerCase());
        if (!tableKey || !schema[tableKey]) return [];
        const columns = schema[tableKey].columns || [];
        return columns.map((col: any) => ({
            label: col.name,
            detail: col.type || 'column',
            type: 'column' as const
        }));
    }, [schema]);

    // Get all tables
    const getAllTables = useCallback((): Suggestion[] => {
        if (!schema) return [];
        return Object.keys(schema).map(tableName => ({
            label: tableName,
            detail: `${schema[tableName].columns?.length || 0} columns`,
            type: 'table' as const
        }));
    }, [schema]);

    // Calculate cursor position in pixels
    const getCursorPosition = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return { top: 0, left: 0 };

        const { selectionStart } = textarea;
        const textBeforeCursor = value.substring(0, selectionStart);
        const lines = textBeforeCursor.split('\n');
        const currentLineIndex = lines.length - 1;
        const currentLineText = lines[currentLineIndex];

        const charWidth = 8.4;
        const lineHeight = 21;

        const top = (currentLineIndex + 1) * lineHeight + 15;
        const left = Math.min(currentLineText.length * charWidth + 60, 400); // Cap at 400px

        return { top, left };
    }, [value]);

    // Check for FROM/JOIN keyword trigger
    const checkKeywordTrigger = useCallback((text: string, cursorPos: number): boolean => {
        const textBefore = text.substring(0, cursorPos);
        // Match FROM or JOIN followed by space (case insensitive)
        const match = textBefore.match(/\b(FROM|JOIN)\s+$/i);
        return !!match;
    }, []);

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;

        onChange(newValue);

        // Check for dot trigger (column completion)
        if (newValue[cursorPos - 1] === '.') {
            const textBefore = newValue.substring(0, cursorPos - 1);
            const match = textBefore.match(/([a-zA-Z0-9_]+)$/);

            if (match && schema) {
                const prefix = match[1];
                const aliases = parseAliases(newValue);
                const tableName = aliases[prefix.toLowerCase()] || prefix;
                const columns = getColumnsForTable(tableName);

                if (columns.length > 0) {
                    setSuggestions(columns);
                    setAllSuggestions(columns);
                    setSelectedIndex(0);
                    setTriggerInfo({ start: cursorPos, type: 'column' });
                    setDropdownPosition(getCursorPosition());
                    setShowDropdown(true);
                    return;
                }
            }
        }

        // Check for FROM/JOIN trigger (table completion)
        if (newValue[cursorPos - 1] === ' ' && checkKeywordTrigger(newValue, cursorPos)) {
            const tables = getAllTables();
            if (tables.length > 0) {
                setSuggestions(tables);
                setAllSuggestions(tables);
                setSelectedIndex(0);
                setTriggerInfo({ start: cursorPos, type: 'table' });
                setDropdownPosition(getCursorPosition());
                setShowDropdown(true);
                return;
            }
        }

        // If dropdown is open, filter based on typing
        if (showDropdown && triggerInfo) {
            const typed = newValue.substring(triggerInfo.start, cursorPos);

            // Check if we're still typing valid identifier characters
            if (typed.match(/^[a-zA-Z0-9_]*$/)) {
                const filtered = allSuggestions.filter(s =>
                    s.label.toLowerCase().startsWith(typed.toLowerCase())
                );
                if (filtered.length > 0) {
                    setSuggestions(filtered);
                    setSelectedIndex(0);
                    return;
                }
            }
            // Close if invalid character or no matches
            setShowDropdown(false);
            setTriggerInfo(null);
        }
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Run Trigger
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (onExecute) onExecute();
            return;
        }

        if (!showDropdown) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (suggestions.length > 0) {
                e.preventDefault();
                insertSuggestion(suggestions[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
            setTriggerInfo(null);
        }
    };

    // Insert selected suggestion
    const insertSuggestion = (suggestion: Suggestion) => {
        if (!textareaRef.current || !triggerInfo) return;

        const cursorPos = textareaRef.current.selectionStart;
        const before = value.substring(0, triggerInfo.start);
        const after = value.substring(cursorPos);
        const newValue = before + suggestion.label + after;

        onChange(newValue);
        setShowDropdown(false);
        setTriggerInfo(null);

        setTimeout(() => {
            if (textareaRef.current) {
                const newPos = triggerInfo.start + suggestion.label.length;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
                setTriggerInfo(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        const { scrollTop, scrollLeft } = e.currentTarget;
        if (codeRef.current) {
            codeRef.current.scrollTop = scrollTop;
            codeRef.current.scrollLeft = scrollLeft;
        }
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = scrollTop;
        }
        if (showDropdown) {
            setShowDropdown(false);
            setTriggerInfo(null);
        }
    };

    useEffect(() => {
        if (textareaRef.current) {
            if (codeRef.current) {
                codeRef.current.scrollTop = textareaRef.current.scrollTop;
                codeRef.current.scrollLeft = textareaRef.current.scrollLeft;
            }
            if (lineNumbersRef.current) {
                lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
            }
        }
    }, [value]);

    useEffect(() => {
        if (errorLine && textareaRef.current) {
            const lineHeight = 21;
            const top = (errorLine - 1) * lineHeight;
            const editorHeight = textareaRef.current.clientHeight;
            const targetScroll = Math.max(0, top - editorHeight / 2 + lineHeight / 2);
            textareaRef.current.scrollTop = targetScroll;
            if (codeRef.current) codeRef.current.scrollTop = targetScroll;
            if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = targetScroll;
        }
    }, [errorLine]);

    const lineCount = (value || '').split('\n').length;
    const lines = Array.from({ length: lineCount }, (_, i) => i + 1);

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative', ...style }}>
            <style>{`
                .simple-editor-textarea::selection {
                    background: rgba(96, 165, 250, 0.3);
                    color: transparent;
                }
                .completion-item:hover {
                    background: #3b82f6 !important;
                }
            `}</style>

            {/* Line Numbers Column */}
            <div
                ref={lineNumbersRef}
                style={{
                    width: '45px',
                    minWidth: '45px',
                    background: '#0f172a',
                    borderRight: '1px solid #334155',
                    color: '#64748b',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    textAlign: 'right',
                    padding: '15px 5px 15px 0',
                    overflow: 'hidden',
                    userSelect: 'none',
                    boxSizing: 'border-box'
                }}
            >
                {lines.map(n => (
                    <div
                        key={n}
                        style={{
                            color: errorLine === n ? '#ef4444' : 'inherit',
                            fontWeight: errorLine === n ? 'bold' : 'normal',
                            paddingRight: '5px'
                        }}
                    >
                        {n}
                    </div>
                ))}
            </div>

            {/* Editor Container */}
            <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#0f172a' }}>
                {/* Syntax Highlighter Layer */}
                <div
                    ref={codeRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        margin: 0,
                        overflow: 'hidden',
                        pointerEvents: 'none',
                    }}
                >
                    <SyntaxHighlighter
                        language={language}
                        style={vscDarkPlus}
                        showLineNumbers={false}
                        wrapLines={false}
                        lineProps={(lineNumber) => {
                            const lineStyle: React.CSSProperties = { display: 'block' };
                            if (errorLine === lineNumber) {
                                lineStyle.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                            } else if (highlightLines.includes(lineNumber)) {
                                lineStyle.backgroundColor = 'rgba(34, 197, 94, 0.35)';
                                lineStyle.borderLeft = '4px solid #4ade80';
                                lineStyle.fontWeight = 'bold';
                            }
                            return { style: lineStyle };
                        }}
                        customStyle={{
                            margin: 0,
                            padding: '15px',
                            minHeight: '100%',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                            background: 'transparent',
                            whiteSpace: 'pre',
                            overflow: 'hidden'
                        }}
                        codeTagProps={{
                            style: { fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace', whiteSpace: 'pre' }
                        }}
                    >
                        {value || ' '}
                    </SyntaxHighlighter>
                </div>

                {/* Editing Layer */}
                <textarea
                    ref={textareaRef}
                    className="simple-editor-textarea"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    spellCheck={false}
                    placeholder={placeholder}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        margin: 0,
                        padding: '15px',
                        border: 'none',
                        color: 'transparent',
                        background: 'transparent',
                        caretColor: '#e2e8f0',
                        outline: 'none',
                        resize: 'none',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                        overflow: 'auto',
                        whiteSpace: 'pre',
                        zIndex: 10
                    }}
                />

                {/* Completion Dropdown */}
                {showDropdown && suggestions.length > 0 && (
                    <div
                        ref={dropdownRef}
                        style={{
                            position: 'absolute',
                            top: dropdownPosition.top,
                            left: dropdownPosition.left,
                            background: '#1e293b',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            zIndex: 1000,
                            maxHeight: '200px',
                            overflowY: 'auto',
                            minWidth: '200px'
                        }}
                    >
                        {suggestions.map((suggestion, index) => (
                            <div
                                key={suggestion.label}
                                className="completion-item"
                                onClick={() => insertSuggestion(suggestion)}
                                style={{
                                    padding: '6px 12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: index === selectedIndex ? '#3b82f6' : 'transparent',
                                    color: '#e2e8f0',
                                    fontSize: '13px',
                                    fontFamily: 'Menlo, Monaco, Consolas, monospace'
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 4px',
                                        borderRadius: '3px',
                                        background: suggestion.type === 'table' ? '#059669' : '#7c3aed',
                                        color: 'white'
                                    }}>
                                        {suggestion.type === 'table' ? 'TBL' : 'COL'}
                                    </span>
                                    {suggestion.label}
                                </span>
                                {suggestion.detail && (
                                    <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '12px' }}>
                                        {suggestion.detail}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SimpleEditor;
