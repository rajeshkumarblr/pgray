import axios from 'axios';

// Backend runs on localhost:9000 (mapped from container 8000)
const API_URL = 'http://localhost:9000/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

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
