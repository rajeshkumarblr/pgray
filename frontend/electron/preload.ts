import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    getLocalApiUrl: () => ipcRenderer.invoke('get-local-api-url'),
    openExternal: (url: string) => ipcRenderer.send('open-external', url),
});
