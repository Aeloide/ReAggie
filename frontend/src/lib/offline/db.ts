export interface OfflineRoom {
  id: string;
  name: string;
  pieces: number;
  created_at: Date;
  imageBlob: Blob;
  imageWidth: number;
  imageHeight: number;
  imageName: string;
  media?: {
    blob: Blob;
    width: number;
    height: number;
    name: string;
  }[];
  layouts: any; // SerializedImageLayoutConfig[]
  roomSettings: any;
  gameState?: any; // To save progress
}

const DB_NAME = 'jiggie-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'rooms';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveOfflineRoom(room: OfflineRoom): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(room);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getOfflineRoom(id: string): Promise<OfflineRoom | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listOfflineRooms(): Promise<OfflineRoom[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result || [];
      // Sort by created_at descending
      results.sort((a: OfflineRoom, b: OfflineRoom) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteOfflineRoom(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
