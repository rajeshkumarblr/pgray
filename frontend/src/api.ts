import axios from 'axios';

// Backend runs on localhost:9000 (mapped from container 8000)
const API_URL = 'http://localhost:9000/api';
const API_BASE_URL = 'http://localhost:9000'; // Base URL for fetch requests

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const getPgSettings = async (connection: any) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/api/settings`, { connection });
        return response.data;
    } catch (error) {
        console.error("Error fetching settings:", error);
        throw error;
    }
};

export const getSavedQueries = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/saved_queries`);
        return response.data;
    } catch (error) {
        console.error("Error fetching saved queries:", error);
        throw error;
    }
};

export const saveQuery = async (name: string, sql: string) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/api/saved_queries`, { name, sql });
        return response.data;
    } catch (error) {
        console.error("Error saving query:", error);
        throw error;
    }
};

export const getSavedQueryContent = async (name: string) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/saved_queries/${name}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching query content:", error);
        throw error;
    }
};

export const checkHealth = async () => {
    try {
        const response = await axios.get('http://localhost:9000/');
        return response.data;
    } catch (error) {
        console.error("Health check failed:", error);
        throw error;
    }
}

export const connectDb = async (connectionInfo: any) => {
    const response = await api.post('/connect', { connection: connectionInfo });
    return response.data;
};

export const explainQuery = async (connectionInfo: any, query: string, analyze: boolean = true) => {
    const response = await api.post('/explain', { connection: connectionInfo, query, analyze });
    return response.data;
};

export const executeQuery = async (connectionInfo: any, query: string, limit: number = 1000) => {
    const response = await api.post('/execute', { connection: connectionInfo, query, limit });
    return response.data;
};

export const getHistory = async () => {
    const response = await api.get('/history');
    return response.data;
};

export const getSchema = async (connectionInfo: any) => {
    const response = await api.post('/schema', { connection: connectionInfo });
    return response.data;
};

export const getServerSettings = async (connectionInfo: any) => {
    const response = await api.post('/settings', { connection: connectionInfo });
    return response.data;
};

export const executeExplain = async (connectionInfo: any, query: string, analyze: boolean = true) => {
    // Note: The backend endpoint might be different depending on implementation, 
    // strictly speaking we called it 'executeExplain' in component but it maps to /explain/text or similar?
    // Let's check backend. `explain.py` has `execute_explain`. 
    // `main.py` typically maps it. 
    // Looking at file viewer history, we didn't inspect `main.py` recently for explain endpoint specifically but `explainQuery` exists above.
    // Wait, `explainQuery` exists at line 69! 
    // `export const explainQuery = ...`
    // The component is importing `executeExplain`. I should alias it or rename it.
    // Let's add `executeExplain` as a wrapper or just export it.
    const response = await api.post('/explain', { connection: connectionInfo, query, analyze });
    return response.data;
};

export const generateSql = async (prompt: string, schema_data: any, history: any[] = [], model: string = "qwen2.5-coder", connection: any = null) => {
    const response = await api.post('/generate_sql', { prompt, schema_data, history, model, connection });
    return response.data;
};

export const explainSql = async (query: string, schema_data: any, model: string = "qwen2.5-coder") => {
    const response = await api.post('/explain_sql', { query, schema_data, model });
    return response.data;
};
