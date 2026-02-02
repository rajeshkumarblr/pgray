import React, { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
    schema?: any; // { tableName: { columns: [...], ... } }
}

const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, schema }) => {
    const monaco = useMonaco();
    const completionProviderRef = useRef<any>(null);

    // Simple Alias Parser
    const parseAliases = (sql: string): Record<string, string> => {
        const aliasMap: Record<string, string> = {};
        if (!sql) return aliasMap;

        // Regex to find table references. 
        // Matches: FROM/JOIN [schema.]table [AS] alias
        const regex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\b/gi;

        let match;
        while ((match = regex.exec(sql)) !== null) {
            const tableName = match[1];
            const alias = match[2];
            if (alias && tableName) {
                aliasMap[alias] = tableName;
            }
        }
        return aliasMap;
    };

    useEffect(() => {
        if (monaco && schema) {
            // Unregister previous provider
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }

            // Register SQL Completion Provider
            completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
                triggerCharacters: ['.'],
                provideCompletionItems: (model, position, context) => {
                    // STRICT MANEUVER: Only trigger on '.' or explicit invocation (Ctrl+Space)
                    // prevent "typing space" from triggering anything.
                    const isDotTrigger = context.triggerCharacter === '.';
                    const isExplicit = context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke;

                    if (!isDotTrigger && !isExplicit) {
                        // Return empty list immediately to stop processing
                        return { suggestions: [] };
                    }

                    try {
                        const word = model.getWordUntilPosition(position);
                        const range = {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: word.startColumn,
                            endColumn: word.endColumn,
                        };

                        const textUntilPosition = model.getValueInRange({
                            startLineNumber: position.lineNumber,
                            startColumn: 1,
                            endLineNumber: position.lineNumber,
                            endColumn: position.column
                        });

                        // Check for dot before cursor
                        const matchDot = textUntilPosition.match(/([a-zA-Z0-9_]+)\.$/);

                        // CASE 1: Dot Trigger (Alias or Table)
                        if (matchDot) {
                            const alias = matchDot[1];
                            const fullSql = model.getValue();
                            const aliases = parseAliases(fullSql);
                            const tableName = aliases[alias] || alias;
                            const suggestions: any[] = [];

                            if (schema[tableName]) {
                                const columns = schema[tableName].columns || [];
                                columns.forEach((col: any) => {
                                    suggestions.push({
                                        label: col.name,
                                        kind: monaco.languages.CompletionItemKind.Field,
                                        insertText: col.name,
                                        detail: `Column (${tableName})`,
                                        documentation: `${col.type}`,
                                        range: range,
                                    });
                                });
                            }
                            return { suggestions };
                        }

                        // CASE 2: No dot, but Explicit Invoke (Ctrl+Space)
                        // Only suggest Keywords and Tables here.
                        if (isExplicit) {
                            const suggestions: any[] = [];

                            // Keywords
                            const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE', 'AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'IN', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS', 'ON', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'HAVING', 'DISTINCT', 'VALUES', 'SET', 'INTO', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'Begin', 'Commit', 'Rollback'];
                            keywords.forEach(kw => {
                                suggestions.push({
                                    label: kw,
                                    kind: monaco.languages.CompletionItemKind.Keyword,
                                    insertText: kw,
                                    range: range,
                                });
                            });

                            // Tables
                            if (schema) {
                                Object.keys(schema).forEach(table => {
                                    suggestions.push({
                                        label: table,
                                        kind: monaco.languages.CompletionItemKind.Class,
                                        insertText: table,
                                        detail: 'Table',
                                        range: range,
                                    });
                                });
                            }
                            return { suggestions };
                        }

                        return { suggestions: [] };

                    } catch (e) {
                        console.error("Auto-completion error:", e);
                        return { suggestions: [] };
                    }
                }
            });
        }

        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }
        };
    }, [monaco, schema]);

    return (
        <div style={{ height: '100%', width: '100%' }}>
            <Editor
                height="100%"
                defaultLanguage="sql"
                value={value}
                onChange={(val) => onChange(val || '')}
                theme="vs-dark"
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 10 },
                    quickSuggestions: false,
                    wordBasedSuggestions: "off",
                }}
            />
        </div>
    );
};

export default SqlEditor;
