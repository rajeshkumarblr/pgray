import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Configure Monaco to use locally bundled editor instead of CDN
// This fixes "Tracking Prevention blocked access to storage" errors
loader.config({ monaco });

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
    schema?: any;
}

const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, schema }) => {
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
                }}
            />
        </div>
    );
};

export default SqlEditor;
