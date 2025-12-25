/**
 * Firebase Configuration for ChatHub
 * Reuses the LearningHub Firebase project
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAGXehXm2yoUB27Wmbd1TkbWFUAoQ-mT3Q",
    authDomain: "learninghub-f6d7e.firebaseapp.com",
    projectId: "learninghub-f6d7e",
    storageBucket: "learninghub-f6d7e.firebasestorage.app",
    messagingSenderId: "87729340320",
    appId: "1:87729340320:web:b41cbc8b2f75d81e732ec5",
    measurementId: "G-SH5ESJBF35"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence
try {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            // Multiple tabs open - expected
        } else if (err.code == 'unimplemented') {
            // Browser doesn't support persistence
        }
    });
} catch (e) {
    // Not critical
}

console.log('Firebase initialized for ChatHub');

export { db };
