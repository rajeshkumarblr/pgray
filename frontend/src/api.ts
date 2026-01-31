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

export const getAIModels = async () => {
    try {
        const response = await api.get('/models');
        if (response.data && response.data.models) {
            return response.data.models;
        }
        return [];
    } catch (e) {
        console.error("Failed to fetch models", e);
        return [];
    }
};

export const getPgSettings = async (connection: any) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/api/settings`, { connection });
        return response.data;
    } catch (error) {
        console.error("Error fetching settings:", error);
        throw error;
    }
};

export const getSavedQueries = async (connection: any = null) => {
    try {
        const params: any = {};
        if (connection) {
            params.connection_json = JSON.stringify(connection);
        }
        const response = await axios.get(`${API_BASE_URL}/api/saved_queries`, { params });
        return response.data;
    } catch (error) {
        console.error("Error fetching saved queries:", error);
        throw error;
    }
};

export const saveQuery = async (name: string, sql: string, history: any[] = [], connection: any = null) => {
    try {
        // Legacy or Session save? Assuming session save logic mostly.
        const response = await axios.post(`${API_BASE_URL}/api/saved_queries`, { name, sql, history, connection });
        return response.data;
    } catch (error) {
        console.error("Error saving query:", error);
        throw error;
    }
};

export const getSavedQueryContent = async (name: string, connection: any = null) => {
    try {
        const params: any = {};
        if (connection) {
            params.connection_json = JSON.stringify(connection);
        }
        const response = await axios.get(`${API_BASE_URL}/api/saved_queries/${name}`, { params });
        return response.data.data;
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
    const response = await api.post('/explain', { connection: connectionInfo, query, analyze });
    return response.data;
};

export const generateSql = async (prompt: string, schema_data: any, history: any[] = [], model: string = "qwen2.5-coder", connection: any = null, plan_text: string = "", sql_query: string = "") => {
    const response = await api.post('/generate_sql', { prompt, schema_data, history, model, connection, plan_text, sql_query });
    return response.data;
};

export const explainSql = async (query: string, schema_data: any, model: string = "qwen2.5-coder") => {
    const response = await api.post('/explain_sql', { query, schema_data, model });
    return response.data;
};

export const getConnectionConfig = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/config/connection`);
        return response.data;
    } catch (error) {
        // Silent fail if file doesn't exist
        return null;
    }
};

export const saveParameterizedQuery = async (sql: string) => {
    // Legacy endpoint?
    const response = await api.post('/queries/save_parameterized', { sql });
    return response.data;
};

export const analyzeQuery = async (sql: string, title?: string) => {
    const response = await api.post('/queries/analyze', { sql, title });
    return response.data;
};

export const saveQueryFinal = async (name: string, sql: string, params: any[], original_sql: string, connection: any = null) => {
    const response = await api.post('/queries/save', { name, sql, params, original_sql, connection });
    return response.data;
};

export const getDistinctValues = async (connection: any, table: string, column: string, search: string = '') => {
    try {
        const response = await api.post('/db/values', { connection, table, column, search });
        return response.data;
    } catch (error) {
        console.error("Error fetching distinct values:", error);
        return { status: "error", values: [] };
    }
};

export const deleteQuery = async (id: string, connection: any = null) => {
    try {
        const params: any = {};
        if (connection) {
            params.connection_json = JSON.stringify(connection);
        }
        const response = await api.delete(`/queries/${id}`, { params });
        return response.data;
    } catch (error) {
        console.error("Error deleting query:", error);
        throw error;
    }
};

export const warmupModel = async (model: string) => {
    // Fire and forget, don't throw
    try {
        await api.post('/warmup', { model });
    } catch (e) {
        console.warn("Warmup failed (ignored)", e);
    }
};
