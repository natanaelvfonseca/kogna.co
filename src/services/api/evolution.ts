export interface EvolutionInstance {
    instance: {
        instanceName: string;
        owner: string;
        profileName: string;
        profilePictureUrl: string;
        profileStatus: string;
        status: string;
        serverUrl: string;
        apikey: string;
    },
    hash: {
        apikey: string;
    }
}

export interface ConnectionState {
    instance: {
        state: 'open' | 'connecting' | 'close' | 'refused';
    }
}

export interface ConnectResponse {
    code: string; // Base64 QR Code
    pairingCode?: string;
}

const API_KEY = '17311a888b37eb2797bf84cc83e1ca40';
const BASE_URL = 'https://tech.kogna.online';

async function fetchEvolution<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
    const headers = {
        'apikey': API_KEY,
        'Content-Type': 'application/json'
    };

    const config: RequestInit = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, config);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `API Error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Evolution API Error (${endpoint}):`, error);
        throw error;
    }
}

export const evolutionApi = {
    createInstance: (instanceName: string) => {
        return fetchEvolution<EvolutionInstance>('/instance/create', 'POST', {
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
        });
    },

    connectInstance: (instanceName: string) => {
        return fetchEvolution<ConnectResponse>(`/instance/connect/${instanceName}`, 'GET');
    },

    getConnectionState: (instanceName: string) => {
        return fetchEvolution<ConnectionState>(`/instance/connectionState/${instanceName}`, 'GET');
    },

    deleteInstance: (instanceName: string) => {
        return fetchEvolution(`/instance/delete/${instanceName}`, 'DELETE');
    },

    logoutInstance: (instanceName: string) => {
        return fetchEvolution(`/instance/logout/${instanceName}`, 'DELETE');
    }
};
