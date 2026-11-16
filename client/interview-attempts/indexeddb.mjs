// Device-local storage only. Account scoping is not a server authorization boundary.
export async function openAttemptStore({indexedDB = globalThis.indexedDB, name = 'ronpark-interview-attempts-v1'} = {}) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore('attempts', {keyPath: 'id'});
      records.createIndex('accountId', 'accountId');
      request.result.createObjectStore('chunks', {keyPath: ['attemptId', 'sequence']});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('storage_blocked'));
  });
  db.onversionchange = () => db.close();
  function transaction(mode, work) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['attempts', 'chunks'], mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || Error('storage_aborted'));
      tx.onerror = () => {}; // onabort reports the transaction failure.
      try { work(tx, value => { result = value; }); } catch (error) { tx.abort(); reject(error); }
    });
  }
  function deleteChunks(tx, id) {
    const request = tx.objectStore('chunks').openCursor(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    request.onsuccess = () => { const cursor = request.result; if (cursor) { if (cursor.value.attemptId === id) cursor.delete(); cursor.continue(); } };
  }
  return {
    create: record => transaction('readwrite', tx => tx.objectStore('attempts').add(record)),
    update: record => transaction('readwrite', tx => {
      const records=tx.objectStore('attempts'), r=records.get(record.id);
      r.onsuccess=()=>{if(!r.result || r.result.state!=='recording' || r.result.chunks!==record.chunks)tx.abort();else records.put(record);};
    }),
    get: id => transaction('readonly', (tx, done) => { const r = tx.objectStore('attempts').get(id); r.onsuccess = () => done(r.result); }),
    list: accountId => transaction('readonly', (tx, done) => { const r = tx.objectStore('attempts').index('accountId').getAll(accountId); r.onsuccess = () => done(r.result.sort((a,b) => b.createdAt - a.createdAt)); }),
    append: (record, blob, sequence) => transaction('readwrite', tx => {
      const records=tx.objectStore('attempts'), r=records.get(record.id);
      r.onsuccess=()=>{
        if(!r.result || r.result.state!=='recording' || r.result.chunks!==sequence){tx.abort();return;}
        tx.objectStore('chunks').add({attemptId: record.id, sequence, blob});
        records.put(record);
      };
    }),
    chunks: id => transaction('readonly', (tx, done) => {
      const r = tx.objectStore('chunks').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      r.onsuccess = () => done(r.result.filter(c => c.attemptId === id).sort((a,b) => a.sequence - b.sequence).map(c => c.blob));
    }),
    remove: id => transaction('readwrite', tx => { tx.objectStore('attempts').delete(id); deleteChunks(tx, id); }),
    close: () => db.close()
  };
}
