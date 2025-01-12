const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  resetDefaults: async () => {
    return await ipcRenderer.invoke("reset-defaults");
  },
  getTransitions: async () => {
    return await ipcRenderer.invoke("get-transitions");
  },
  saveTransitions: async (transitions) => {
    return await ipcRenderer.invoke("save-transitions", transitions);
  },
});
