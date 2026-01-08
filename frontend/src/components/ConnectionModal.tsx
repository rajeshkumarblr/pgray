import React, { useState } from 'react';

interface ConnectionInfo {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (info: ConnectionInfo) => void;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [host, setHost] = useState('host.docker.internal');
  const [port, setPort] = useState(5432);
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('postgres');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      host,
      port,
      username,
      password,
      database,
    });
  };

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const contentStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    width: '400px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: '15px',
    display: 'flex',
    flexDirection: 'column',
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  };

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <h2 style={{ marginTop: 0 }}>Connect to Database</h2>
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label>Host</label>
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
            <label>Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label>Database</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Connect</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConnectionModal;
