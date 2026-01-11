import React, { useState } from 'react';

interface ConnectionInfo {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  schema: string;
}

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (info: ConnectionInfo) => void;
  initialInfo?: ConnectionInfo;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({ isOpen, onClose, onSubmit, initialInfo }) => {
  const [host, setHost] = useState('host.docker.internal');
  const [port, setPort] = useState(5432);
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('postgres');
  const [schema, setSchema] = useState('public');

  React.useEffect(() => {
    if (isOpen && initialInfo) {
      setHost(initialInfo.host);
      setPort(initialInfo.port);
      setUsername(initialInfo.username);
      setPassword(initialInfo.password);
      setDatabase(initialInfo.database);
      setSchema(initialInfo.schema);
    }
  }, [isOpen, initialInfo]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      host,
      port,
      username,
      password,
      database,
      schema,
    });
  };

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const contentStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    padding: '25px',
    borderRadius: '8px',
    width: '400px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    color: '#e2e8f0',
    border: '1px solid #334155'
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: '15px',
    display: 'flex',
    flexDirection: 'column',
  };

  const inputStyle: React.CSSProperties = {
    padding: '10px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    color: '#fff',
    outline: 'none',
    marginTop: '5px'
  };

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#f1f5f9' }}>Connect to Database</h2>
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={{ fontSize: '13px', color: '#94a3b8' }}>Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="e.g. host.docker.internal"
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={{ fontSize: '13px', color: '#94a3b8' }}>Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={{ fontSize: '13px', color: '#94a3b8' }}>Database</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={{ fontSize: '13px', color: '#94a3b8' }}>Schema</label>
            <input
              type="text"
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder="public"
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={{ fontSize: '13px', color: '#94a3b8' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={{ fontSize: '13px', color: '#94a3b8' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '25px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #475569',
                color: '#cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConnectionModal;
