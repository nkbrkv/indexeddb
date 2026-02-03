import {openDB, adaptRequestIterator} from './adapters.js';

const upgradeHandler = async (db) => {
    const store = db.createObjectStore('users', {keyPath: 'id', autoIncrement: true});
    await store.add({name: 'David', lastName: 'Totrashvili', age: 35, city: 'Tashkent'});
    await store.add({name: 'Alice', lastName: 'Johnson', age: 28, city: 'New York'});
    await store.add({name: 'Bob', lastName: 'Smith', age: 42, city: 'Los Angeles'});
    await store.add({name: 'Eve', lastName: 'Davis', age: 30, city: 'Chicago'});
    await store.add({name: 'Charlie', lastName: 'Brown', age: 25, city: 'Houston'});
    await store.add({name: 'Frank', lastName: 'Miller', age: 40, city: 'Phoenix'});
    await store.add({name: 'Grace', lastName: 'Wilson', age: 27, city: 'Philadelphia'});
    await store.add({name: 'Hannah', lastName: 'Moore', age: 33, city: 'San Antonio'});
    await store.add({name: 'Ian', lastName: 'Taylor', age: 29, city: 'San Diego'});
    await store.add({name: 'Judy', lastName: 'Anderson', age: 31, city: 'Dallas'});
    await store.add({name: 'Kevin', lastName: 'Thomas', age: 38, city: 'San Jose'});
    await store.add({name: 'Laura', lastName: 'Jackson', age: 26, city: 'Austin'});
    await store.add({name: 'Mike', lastName: 'White', age: 34, city: 'Fort Worth'});
    await store.add({name: 'Nina', lastName: 'Harris', age: 32, city: 'Columbus'});
    await store.add({name: 'Oscar', lastName: 'Martin', age: 36, city: 'Charlotte'});
    await store.add({name: 'Pam', lastName: 'Thompson', age: 24, city: 'San Francisco'});
    store.createIndex('name', 'name', {unique: false});
    store.createIndex('age', 'age', {unique: false});
};

const database = 'test_db';

const example1 = async () => {
    try {
        const db = await openDB(database, upgradeHandler);
        const transaction = db.transaction(['users'], 'readwrite');
        console.log('objectStoreNames:', transaction.objectStoreNames);
        const store = transaction.objectStore('users');

        console.log('\nRecord:', await store.get(3), '\n');
    } catch (error) {
        console.error('Error opening database:', error);
    }
};

const example2 = async () => {
    try {
        const db = await openDB(database, upgradeHandler);
        const tx = db.transaction(['users'], 'readwrite');
        const store = tx.objectStore('users');
        const asyncIterator = adaptRequestIterator(store.openCursor());
        console.log('asyncIterator:', asyncIterator);
        for await (const cursor of asyncIterator) {
            console.log('Cursor at:', cursor.value);
            const {value} = cursor;
            await cursor.update({...value, updated: true});
        }
        const all = await store.getAll();
        console.log('All records after update:', all);
    } catch (error) {
        console.error('Error opening database:', error);
    }
};

// const example3 = async () => {
//     try {
//         const db = await openDB(database, upgradeHandler);
//         const tx = db.transaction(['users'], 'readwrite');
//         const store = tx.objectStore('users');
//         const index = store.index('by_name');
//         const asyncIterator = index.openCursor();
//         for await (const cursor of asyncIterator) {
//             console.log('Cursor at:', cursor.value);
//             const {value} = cursor;
//             if (value.name === 'Ivan') {
//                 await cursor.delete();
//                 console.log('Deleted record with name Ivan');
//             }
//         }
//         const all = await store.getAll();
//         console.log('All records after deletion:', all);
//     } catch (error) {
//         console.error('Error opening database:', error);
//     }
// };

(async () => {
    console.log('Example 1: Get all records');
    await example1();

    console.log('\n\nExample 2: Update records using cursor');
    await example2();

    // console.log('\n\nExample 3: Delete record using index cursor');
    // await example3();
})();
