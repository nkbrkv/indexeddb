import {indexedDB} from 'fake-indexeddb';

const eventTypes = {
    error: 'error',
    abort: 'abort',
    success: 'success',
    blocked: 'blocked',
    complete: 'complete',
    upgradeNeeded: 'upgradeneeded',
};

function once(eventTarget, eventName, options = {}) {
    const {signal} = options;

    if (signal?.aborted) return Promise.reject(new Error('Operation aborted'));

    return new Promise((resolve, reject) => {
        const removeListeners = () => {
            if (signal) signal.removeEventListener(eventTypes.abort, onAbort);
            eventTarget.removeEventListener(eventName, onEvent);
        };

        const onAbort = () => {
            removeListeners();
            reject(new Error('Operation aborted'));
        };

        const onEvent = (data) => {
            removeListeners();
            resolve(data);
        };

        if (signal) signal.addEventListener(eventTypes.abort, onAbort);
        eventTarget.addEventListener(eventName, onEvent);
    });
}

async function* on(eventTarget, eventName, options = {}) {
    while (true) yield await once(eventTarget, eventName, options);
}

async function adaptRequest(request) {
    const controller = new AbortController();
    const {signal} = controller;

    try {
        const result = await Promise.race([
            once(request, eventTypes.success, {signal}),
            once(request, eventTypes.error, {signal}),
        ]);

        if (result.type === eventTypes.success) return request.result;
        else throw request.error;
    } finally {
        controller.abort();
    }
}

async function adaptOpenDBRequest(request, upgradeHandler) {
    const controller = new AbortController();
    const {signal} = controller;

    const ignoreAbort = (err) => {
        if (err.message === 'Operation aborted' || err.name === 'AbortError') return;
        throw err;
    };

    return new Promise((resolve, reject) => {
        once(request, eventTypes.upgradeNeeded, {signal})
            .then(() => upgradeHandler?.(request.result))
            .catch(ignoreAbort);

        once(request, eventTypes.blocked, {signal})
            .then(() => reject(new Error('Database is blocked')))
            .catch(ignoreAbort);

        once(request, eventTypes.success, {signal})
            .then(() => resolve(request.result))
            .catch(ignoreAbort);

        once(request, eventTypes.error, {signal})
            .then(() => reject(request.error))
            .catch(ignoreAbort);
    }).finally(() => controller.abort());
}

function adaptObjectStore(sourceStore) {
    const store = Object.create(sourceStore);
    store.clear = () => adaptRequest(sourceStore.clear());
    store.get = (key) => adaptRequest(sourceStore.get(key));
    store.delete = (key) => adaptRequest(sourceStore.delete(key));
    store.getKey = (key) => adaptRequest(sourceStore.getKey(key));
    store.count = (query) => adaptRequest(sourceStore.count(query));
    store.put = (value, key) => adaptRequest(sourceStore.put(value, key));
    store.add = (value, key) => adaptRequest(sourceStore.add(value, key));
    store.getAll = (query, count) => adaptRequest(sourceStore.getAll(query, count));
    store.getAllKeys = (query, count) => adaptRequest(sourceStore.getAllKeys(query, count));
    return store;
}

function adaptTransaction(sourceTX) {
    const tx = Object.create(sourceTX);
    tx.objectStoreNames = Array.from(sourceTX.objectStoreNames);
    tx.objectStore = function (name) {
        const sourceStore = sourceTX.objectStore(name);
        return adaptObjectStore(sourceStore);
    };
    return tx;
}

async function adaptDB(sourceDB) {
    const db = Object.create(sourceDB);
    db.transaction = function (storeNames, mode, options) {
        const sourceTX = sourceDB.transaction(storeNames, mode, options);
        return adaptTransaction(sourceTX);
    };
    db.createObjectStore = function (name, options) {
        const sourceStore = sourceDB.createObjectStore(name, options);
        return adaptObjectStore(sourceStore);
    };
    return db;
}

async function openDB(name, upgradeHandler) {
    const request = indexedDB.open(name);
    const sourceDB = await adaptOpenDBRequest(request, upgradeHandler);
    return adaptDB(sourceDB);
}

// Usage examples
const database = 'TestDB';

const upgradeHandler = async (db) => {
    const hasUsersStore = db.objectStoreNames.contains('users');
    if (hasUsersStore) return;
    const store = db.createObjectStore('users', {keyPath: 'id', autoIncrement: true});
    store.createIndex('by_name', 'name', {unique: false});
    store.createIndex('by_email', 'email', {unique: true});
    await store.add({name: 'Maria', email: 'maria@example.com'});
    await store.add({name: 'Ivan', email: 'ivan@example.com'});
    await store.add({name: 'John', email: 'john@example.com'});
    await store.add({name: 'Anna', email: 'anna@example.com'});
};

const example1 = async () => {
    try {
        const db = await openDB(database, upgradeHandler);
        const transaction = db.transaction(['users'], 'readwrite');
        const store = transaction.objectStore('users');
        const all = await store.getAll();
        console.log('All records in the store:', all);
    } catch (error) {
        console.error('Error opening database:', error);
    }
};

const example2 = async () => {
    try {
        const db = await openDB(database, upgradeHandler);
        const tx = db.transaction(['users'], 'readwrite');
        const store = tx.objectStore('users');
        const asyncIterator = store.openCursor();
        for await (const cursor of asyncIterator) {
            const {value} = cursor;
            await cursor.update({...value, count: value.count + 1});
            cursor.continue();
        }
    } catch (error) {
        console.error('Error opening database:', error);
    }
};

(async () => {
    await example1();
    // await example2();
})();
