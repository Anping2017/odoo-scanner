// IndexedDB 工具函数，用于存储离线产品数据

const DB_NAME = 'odoo_scanner_db';
const DB_VERSION = 1;
const STORE_NAME = 'products_offline';
const METADATA_KEY = 'metadata';

// 打开数据库
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // 创建索引以便快速查询
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// 保存产品数据（使用批量存储，提高效率）
export async function saveOfflineProducts(products: any[]): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('IndexedDB is not available');
  }

  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  // 先清空现有数据
  await new Promise<void>((resolve, reject) => {
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => resolve();
    clearRequest.onerror = () => reject(clearRequest.error);
  });

  // 批量保存产品数据（每批1000个）
  const batchSize = 1000;
  const timestamp = Date.now();
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    await new Promise<void>((resolve, reject) => {
      let completed = 0;
      let hasError = false;

      batch.forEach((product, batchIndex) => {
        const request = store.put({ 
          id: `product_${i + batchIndex}`, 
          product, 
          timestamp 
        });
        request.onsuccess = () => {
          completed++;
          if (completed === batch.length && !hasError) {
            resolve();
          }
        };
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
      });
    });
  }

  // 保存元数据
  await new Promise<void>((resolve, reject) => {
    const request = store.put({ 
      id: METADATA_KEY, 
      product: null, 
      timestamp,
      count: products.length 
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
}

// 加载产品数据
export async function loadOfflineProducts(): Promise<{ products: any[], timestamp: number } | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    // 获取元数据
    const metadata = await new Promise<any>((resolve, reject) => {
      const request = store.get(METADATA_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!metadata) {
      db.close();
      return null;
    }

    // 使用游标遍历获取所有产品数据（排除元数据）
    const products: any[] = [];
    
    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const item = cursor.value;
          // 排除元数据项，只获取产品数据
          if (item.id !== METADATA_KEY && item.product) {
            products.push(item.product);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (products.length === 0) {
      return null;
    }

    return {
      products,
      timestamp: metadata.timestamp
    };
  } catch (e) {
    console.error('加载离线数据失败:', e);
    return null;
  }
}

// 清除离线数据
export async function clearOfflineProducts(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return;
  }

  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (e) {
    console.error('清除离线数据失败:', e);
  }
}

