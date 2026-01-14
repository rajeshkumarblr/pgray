import React, { useMemo, useState, useRef, useEffect } from 'react';
import { format } from 'sql-formatter';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface SqlOverlayProps {
    sqlQuery: string;
    highlightText?: string;
    visible: boolean;
    initialPosition?: { x: number; y: number } | null;
}

const SqlOverlay: React.FC<SqlOverlayProps> = ({ sqlQuery, highlightText, visible, initialPosition }) => {
    // Draggable State
    const [position, setPosition] = useState({ x: 20, y: window.innerHeight / 2 });
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Update position when initialPosition is provided
    useEffect(() => {
        if (initialPosition) {
            setPosition(initialPosition);
        }
    }, [initialPosition]);

    // Handle Drag Start
    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
        // Disable selection while dragging
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    };

    // Global Drag Listeners
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
        };

        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const formattedSql = useMemo(() => {
        if (!sqlQuery) return '';
        try {
            return format(sqlQuery, { language: 'postgresql' });
        } catch (e) {
            return sqlQuery;
        }
    }, [sqlQuery]);

    const lines = useMemo(() => formattedSql.split('\n'), [formattedSql]);

    // Robust matching logic calculated upfront
    const matchedLineNumbers = useMemo(() => {
        if (!highlightText) return [];
        const matches: number[] = [];
        const searchText = highlightText.toLowerCase();
        const searchTerms = searchText.split(' ').filter(t => t.length > 0);

        lines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();

            // 1. Try exact match
            let isMatch = lowerLine.includes(searchText);

            // 2. Fallback: Check if all terms exist in the line (handles weird formatting)
            if (!isMatch && searchTerms.length > 0) {
                isMatch = searchTerms.every(term => lowerLine.includes(term));
            }

            if (isMatch) matches.push(index + 1);
        });
        return matches;
    }, [lines, highlightText]);

    if (!visible || !sqlQuery) return null;

    return (
        <div style={{
            position: 'fixed', // Fixed to support global dragging
            left: position.x + 'px',
            top: position.y + 'px',
            // transform removed to treat y as top edge
            width: '350px',
            maxHeight: '60%',
            backgroundColor: 'rgba(30, 41, 59, 1)',
            border: '1px solid #475569',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            <div
                onMouseDown={handleMouseDown}
                style={{
                    padding: '10px 15px',
                    background: 'rgba(15, 23, 42, 1)',
                    borderBottom: '1px solid #334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexDirection: 'column',
                    cursor: 'grab', // Indicate draggable
                    userSelect: 'none'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ACTIVE QUERY</span>
                    <span style={{ fontSize: '14px', marginLeft: 'auto' }}>⋮⋮</span>
                </div>
                {highlightText && (
                    <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px' }}>
                        Finding: <span style={{ color: '#38bdf8' }}>"{highlightText}"</span>
                        {/* Debugging: Show match count to verify logic */}
                        {matchedLineNumbers.length === 0 && <span style={{ color: '#f87171', marginLeft: '5px' }}>(No matches)</span>}
                    </span>
                )}
            </div>

            <div
                style={{
                    overflow: 'auto',
                    flex: 1,
                    fontSize: '12px',
                    backgroundColor: '#0f172a',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#475569 transparent',
                    cursor: 'text' // Auto cursor for text area
                }}
                onMouseDown={(e) => e.stopPropagation()} // Prevent drag when interacting with scroll/text
            >
                <SyntaxHighlighter
                    language="sql"
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '15px',
                        background: 'transparent',
                        fontSize: '12px',
                        lineHeight: '1.5'
                    }}
                    wrapLines={true}
                    showLineNumbers={true}
                    lineProps={(lineNumber: number) => {
                        if (matchedLineNumbers.includes(lineNumber)) {
                            return {
                                style: {
                                    display: 'block',
                                    backgroundColor: '#854d0e',
                                    color: '#fef08a',
                                    fontWeight: 'bold',
                                    borderLeft: '4px solid #facc15',
                                    paddingLeft: '11px',
                                    marginLeft: '-15px',
                                    width: 'calc(100% + 15px)'
                                }
                            };
                        }
                        return { style: { display: 'block' } };
                    }}
                >
                    {formattedSql}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default SqlOverlay;
