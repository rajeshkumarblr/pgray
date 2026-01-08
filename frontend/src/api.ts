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

export const explainQuery = async (connectionInfo: any, query: string) => {
    const response = await api.post('/explain', { connection: connectionInfo, query });
    return response.data;
};
