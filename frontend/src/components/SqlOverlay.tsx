import React, { useMemo } from 'react';
import { format } from 'sql-formatter';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface SqlOverlayProps {
    sqlQuery: string;
    highlightText?: string;
    visible: boolean;
}

const SqlOverlay: React.FC<SqlOverlayProps> = ({ sqlQuery, highlightText, visible }) => {

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
            position: 'absolute',
            left: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '350px',
            maxHeight: '60%',
            backgroundColor: 'rgba(30, 41, 59, 1)',
            border: '1px solid #475569',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            <div style={{
                padding: '10px 15px',
                background: 'rgba(15, 23, 42, 1)',
                borderBottom: '1px solid #334155',
                fontSize: '12px',
                fontWeight: 600,
                color: '#94a3b8',
                display: 'flex',
                justifyContent: 'space-between',
                flexDirection: 'column'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ACTIVE QUERY</span>
                </div>
                {highlightText && (
                    <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px' }}>
                        Finding: <span style={{ color: '#38bdf8' }}>"{highlightText}"</span>
                        {/* Debugging: Show match count to verify logic */}
                        {matchedLineNumbers.length === 0 && <span style={{ color: '#f87171', marginLeft: '5px' }}>(No matches)</span>}
                    </span>
                )}
            </div>

            <div style={{
                overflow: 'auto',
                flex: 1,
                fontSize: '12px',
                backgroundColor: '#0f172a',
                scrollbarWidth: 'thin',
                scrollbarColor: '#475569 transparent',
            }}>
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
                    showLineNumbers={true} // Turning on line numbers helps with visual alignment/debugging
                    lineProps={(lineNumber: number) => {
                        if (matchedLineNumbers.includes(lineNumber)) {
                            return {
                                style: {
                                    display: 'block',
                                    backgroundColor: '#854d0e', // Dark opaque yellow/brown background
                                    color: '#fef08a',           // Bright yellow text
                                    fontWeight: 'bold',         // BOLD text as requested
                                    borderLeft: '4px solid #facc15', // Solid left border
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
