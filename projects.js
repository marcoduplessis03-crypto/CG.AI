
(() => {
  function request(mode, project, key = 'current') {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open('cg-ai-projects', 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('projects');
      opening.onerror = opening.onblocked = () => reject(new Error('Browser storage is unavailable.'));
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction('projects',mode);
        const store = transaction.objectStore('projects');
        const pending = mode === 'readwrite' ? store.put(project,key) : key === null ? store.getAll() : store.get(key);
        transaction.oncomplete = () => { db.close(); resolve(pending.result); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }

  function pack(project) {
    const encode = recordings => recordings.map(({track,rate,samples}) => {
      const bytes = new Uint8Array(samples.buffer,samples.byteOffset,samples.byteLength);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      }
      return {track,rate,data:btoa(binary)};
    });
    return JSON.stringify({...project,vocals:encode(project.vocals),originals:encode(project.originals || [])});
  }

  function unpack(text) {
    const project = JSON.parse(text);
    if (project?.format !== 'cg-ai' || project.version !== 1 || !Array.isArray(project.vocals) || project.vocals.length > 8) {
      throw new Error('Invalid CG.AI project.');
    }
    const decode = recordings => recordings.map(({track,rate,data}) => {
      if (!Number.isInteger(rate) || rate < 8000 || rate > 192000 ||
          typeof data !== 'string' || data.length > Math.ceil(rate * 25 * 4 / 3) * 4) {
        throw new Error('Invalid vocal recording.');
      }
      const bytes = Uint8Array.from(atob(data),char=>char.charCodeAt(0));
      return {track,rate,samples:new Float32Array(bytes.buffer)};
    });
    if (project.originals && (!Array.isArray(project.originals) || project.originals.length > 8)) throw new Error('Invalid originals.');
    project.vocals = decode(project.vocals);
    project.originals = decode(project.originals || []);
    return project;
  }

  window.CGProjects = {
    save:project=>request('readwrite',project),load:()=>request('readonly'),pack,unpack,
    saveVersion:(name,project)=>{const id = 'version-' + crypto.randomUUID(); return request('readwrite',{id,name,project},id);},
    getVersion:id=>request('readonly',undefined,id),
    versions:async ()=> (await request('readonly',undefined,null)).filter(item=>item.id?.startsWith('version-')).map(({id,name})=>({id,name}))
  };
})();
