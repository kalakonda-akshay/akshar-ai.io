// Web Fallback for Electron API
(function() {
  const dbName = "AksharAI";
  const storeName = "resources";

  // Initialize browser-based IndexedDB database
  function getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "name" });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Web equivalent of res-* ipc calls using IndexedDB
  const webRes = {
    list: async () => {
      try {
        const db = await getDB();
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => {
            resolve(request.result.map(item => ({
              name: item.name,
              ext: item.ext,
              size: item.size,
              path: item.name // Virtual path
            })));
          };
          request.onerror = () => resolve([]);
        });
      } catch (e) {
        return [];
      }
    },
    save: async ({ name, data, ext }) => {
      try {
        const db = await getDB();
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const size = Math.round((data.length * 3) / 4); // base64 to byte approximation
          const item = { name, data, ext, size };
          const request = store.put(item);
          request.onsuccess = () => resolve({ ok: true, name });
          request.onerror = (e) => resolve({ ok: false, error: e.target.error?.message || 'DB error' });
        });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    open: async (name) => {
      try {
        const db = await getDB();
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.get(name);
          request.onsuccess = () => {
            const item = request.result;
            if (item) {
              const binary = atob(item.data);
              const array = [];
              for (let i = 0; i < binary.length; i++) {
                array.push(binary.charCodeAt(i));
              }
              const mime = extToMime(item.ext);
              const blob = new Blob([new Uint8Array(array)], { type: mime });
              const url = URL.createObjectURL(blob);
              
              // Trigger web download
              const a = document.createElement('a');
              a.href = url;
              a.download = item.name;
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }, 100);
              resolve({ ok: true });
            } else {
              resolve({ ok: false, error: 'File not found' });
            }
          };
          request.onerror = (e) => resolve({ ok: false, error: e.target.error?.message || 'DB error' });
        });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    del: async (name) => {
      try {
        const db = await getDB();
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.delete(name);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      } catch (e) {
        return false;
      }
    }
  };

  function extToMime(ext) {
    const map = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip'
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
  }

  window.webRes = webRes;

  let ipcRenderer;
  if (typeof require !== 'undefined') {
    try {
      ipcRenderer = require('electron').ipcRenderer;
    } catch (e) {}
  }

  if (!ipcRenderer) {
    console.log("🚀 Web Fallback bridge loaded. Overriding Electron IPC channels...");
    
    // In-memory virtual web path files cache
    window._tempFiles = window._tempFiles || {};

    ipcRenderer = {
      isElectron: false,
      send: (channel, ...args) => {
        console.log(`[Web IPC Send] ${channel}`, args);
      },
      invoke: async (channel, ...args) => {
        console.log(`[Web IPC Invoke] ${channel}`, args);
        
        if (channel === 'get-port') {
          // In web mode, the server runs on the current window port
          return window.location.port || 52700;
        }
        
        if (channel === 'db-set') {
          const { key, val } = args[0];
          localStorage.setItem(key, JSON.stringify(val));
          return true;
        }
        
        if (channel === 'db-get') {
          const key = args[0];
          const val = localStorage.getItem(key);
          try { return val ? JSON.parse(val) : null; } catch(e) { return null; }
        }
        
        if (channel === 'res-list') {
          return webRes.list();
        }
        if (channel === 'res-save') {
          return webRes.save(args[0]);
        }
        if (channel === 'res-open') {
          return webRes.open(args[0]);
        }
        if (channel === 'res-del') {
          return webRes.del(args[0]);
        }
        
        if (channel === 'file-open') {
          return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            const opts = args[0] || {};
            if (opts.all) {
              input.accept = '.pdf,.docx,.txt,.pptx,.png,.jpg,.mp4,.zip';
            } else if (opts.filters) {
              const exts = opts.filters.flatMap(f => f.extensions).map(e => '.' + e).join(',');
              input.accept = exts;
            } else {
              input.accept = '.pdf,.docx,.txt,.pptx';
            }
            
            input.onchange = (e) => {
              const file = e.target.files[0];
              if (!file) { resolve(null); return; }
              const reader = new FileReader();
              reader.onload = (evt) => {
                const base64Data = evt.target.result.split(',')[1];
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                const virtualPath = `virtual_web_path://${Date.now()}_${file.name}`;
                
                window._tempFiles[virtualPath] = {
                  name: file.name,
                  data: base64Data,
                  ext: ext
                };
                resolve(virtualPath);
              };
              reader.readAsDataURL(file);
            };
            input.click();
          });
        }
        
        if (channel === 'file-read') {
          const fp = args[0];
          if (window._tempFiles && window._tempFiles[fp]) {
            return window._tempFiles[fp];
          }
          return { error: 'File not found in browser session cache.' };
        }
        
        return null;
      }
    };
  } else {
    ipcRenderer.isElectron = true;
  }

  window.ipcRenderer = ipcRenderer;

  // Auto-hide titlebar buttons when not in Electron
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.ipcRenderer.isElectron) {
      const btns = document.querySelector('.tb-btns');
      if (btns) btns.style.display = 'none';
      const brand = document.querySelector('.tb-brand');
      if (brand) brand.style.marginRight = 'auto'; // center/align brand correctly
    }
  });
})();
