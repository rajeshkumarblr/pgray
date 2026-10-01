import React from 'react';
import SimpleEditor from './SimpleEditor';

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
    schema?: any;
}

const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, schema }) => {
    return (
        <div style={{ height: '100%', width: '100%' }}>
            <SimpleEditor value={value} onChange={onChange} schema={schema} />
        </div>
    );
};

export default SqlEditor;
