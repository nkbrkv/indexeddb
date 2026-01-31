// import {indexedDB} from 'fake-indexeddb';
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

export async function adaptRequest(request) {
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

export async function* adaptRequestIterator(request) {
    while (true) {
        yield await adaptRequest(request);
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

function adaptCursor(sourceCursor) {
    return applyAdapters(sourceCursor, {
        delete: adaptRequest,
        update: adaptRequest,
    });
}

function adaptIndex(sourceIndex) {
    return applyAdapters(sourceIndex, {
        get: adaptRequest,
        getKey: adaptRequest,
        count: adaptRequest,
        getAll: adaptRequest,
        getAllKeys: adaptRequest,
        openCursor: adaptCursor,
        openKeyCursor: adaptCursor,
    });
}

function adaptObjectStore(sourceStore) {
    return applyAdapters(sourceStore, {
        clear: adaptRequest,
        get: adaptRequest,
        index: adaptIndex,
        delete: adaptRequest,
        getKey: adaptRequest,
        count: adaptRequest,
        put: adaptRequest,
        add: adaptRequest,
        getAll: adaptRequest,
        getAllKeys: adaptRequest,
        openCursor: adaptCursor,
        openKeyCursor: adaptCursor,
        createIndex: adaptIndex,
    });
}

function adaptTransaction(sourceTX) {
    return applyAdapters(sourceTX, {
        objectStoreNames: Array.from,
        objectStore: adaptObjectStore,
    });
}

function adaptDB(sourceDB) {
    return applyAdapters(sourceDB, {
        transaction: adaptTransaction,
        createObjectStore: adaptObjectStore,
        objectStoreNames: Array.from,
    });
}

async function openDB(name, upgradeHandler) {
    const request = indexedDB.open(name);
    const sourceDB = await adaptOpenDBRequest(request, upgradeHandler);
    return adaptDB(sourceDB);
}

const applyAdapters = (source, schema = {}) => {
    const proto = Object.getPrototypeOf(source);
    const proxy = Object.create(proto);
    const descriptors = Object.getOwnPropertyDescriptors(proto);

    for (const [key, descriptor] of Object.entries(descriptors)) {
        const adapter = schema[key];
        if (typeof descriptor.value === 'function') {
            if (adapter) descriptor.value = (...args) => adapter(source[key](...args));
            else descriptor.value = (...args) => source[key](...args);
            Object.defineProperty(proxy, key, descriptor);
        } else if (descriptor.get) {
            if (adapter) descriptor.get = () => adapter(source[key]);
            else descriptor.get = () => source[key];
            Object.defineProperty(proxy, key, descriptor);
        }
    }
    return proxy;
};

export {openDB};
