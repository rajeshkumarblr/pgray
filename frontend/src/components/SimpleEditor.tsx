import React, { useRef, useEffect } from 'react';
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
}

const SimpleEditor: React.FC<SimpleEditorProps> = ({ value, onChange, language = 'sql', placeholder, style, errorLine, highlightLines = [] }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const codeRef = useRef<HTMLDivElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        const { scrollTop, scrollLeft } = e.currentTarget;
        if (codeRef.current) {
            codeRef.current.scrollTop = scrollTop;
            codeRef.current.scrollLeft = scrollLeft;
        }
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = scrollTop;
        }
    };

    // Sync scroll initially and on value change just in case
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

    // Scroll to error line
    useEffect(() => {
        if (errorLine && textareaRef.current) {
            // Assuming 14px font size * 1.5 line height = 21px
            const lineHeight = 21;
            const top = (errorLine - 1) * lineHeight;

            // Center the line in view if possible
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
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', ...style }}>
            <style>{`
                .simple-editor-textarea::selection {
                    background: rgba(96, 165, 250, 0.3);
                    color: transparent;
                }
            `}</style>

            {/* Line Numbers Column */}
            <div
                ref={lineNumbersRef}
                style={{
                    width: '45px', // Fixed width
                    minWidth: '45px',
                    background: '#0f172a',
                    borderRight: '1px solid #334155',
                    color: '#64748b',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    textAlign: 'right',
                    padding: '15px 5px 15px 0',
                    overflow: 'hidden', // No scrolling by user
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
                {/* Syntax Highlighter Layer (Background) */}
                <div
                    ref={codeRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        margin: 0,
                        overflow: 'hidden', // Hidden scroll, synced via JS
                        pointerEvents: 'none',
                    }}
                >
                    <SyntaxHighlighter
                        language={language}
                        style={vscDarkPlus}
                        showLineNumbers={false} // Disabled built-in
                        wrapLines={false}
                        lineProps={(lineNumber) => {
                            const style: React.CSSProperties = { display: 'block' };
                            if (errorLine === lineNumber) {
                                style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                            } else if (highlightLines.includes(lineNumber)) {
                                style.backgroundColor = 'rgba(34, 197, 94, 0.35)';
                                style.borderLeft = '4px solid #4ade80'; // Bright green bar
                                style.fontWeight = 'bold';
                            }
                            return { style };
                        }}
                        customStyle={{
                            margin: 0,
                            padding: '15px', // Matches textarea exactly
                            minHeight: '100%',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                            background: 'transparent',
                            whiteSpace: 'pre', // Matches textarea
                            overflow: 'hidden'
                        }}
                        codeTagProps={{
                            style: { fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace', whiteSpace: 'pre' }
                        }}
                    >
                        {value || ' '}
                    </SyntaxHighlighter>
                </div>

                {/* Editing Layer (Foreground) */}
                <textarea
                    ref={textareaRef}
                    className="simple-editor-textarea"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
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
                        padding: '15px', // Matches Highlighter
                        border: 'none',
                        color: 'transparent',
                        background: 'transparent',
                        caretColor: '#e2e8f0',
                        outline: 'none',
                        resize: 'none',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                        overflow: 'auto', // User scrolls this
                        whiteSpace: 'pre',
                        zIndex: 10
                    }}
                />
            </div>
        </div>
    );
};

export default SimpleEditor;
