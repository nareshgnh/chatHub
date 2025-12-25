/**
 * ChatHub - Chat Storage with Firebase Firestore
 * Handles persistence of chat threads and messages
 */

import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class ChatStorage {
    constructor() {
        this.COLLECTION = 'chathub_conversations';
        this.deviceId = this.getDeviceId();
    }

    // Get or generate a unique device ID
    getDeviceId() {
        let deviceId = localStorage.getItem('chathub_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chathub_device_id', deviceId);
        }
        return deviceId;
    }

    /**
     * Create a new chat
     * @param {string} title - Chat title
     * @param {Array} messages - Initial messages
     * @returns {Object} Created chat object with id
     */
    async createChat(title, messages = []) {
        try {
            const chatData = {
                deviceId: this.deviceId,
                title: title || 'New Chat',
                messages: messages,
                archived: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, this.COLLECTION), chatData);
            console.log('Chat created:', docRef.id);

            return {
                id: docRef.id,
                ...chatData,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        } catch (error) {
            console.error('Error creating chat:', error);
            throw error;
        }
    }

    /**
     * Update a chat (title, messages, or archive status)
     * @param {string} chatId - Chat ID
     * @param {Object} updates - Fields to update
     */
    async updateChat(chatId, updates) {
        try {
            const chatRef = doc(db, this.COLLECTION, chatId);
            await updateDoc(chatRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            console.log('Chat updated:', chatId);
        } catch (error) {
            console.error('Error updating chat:', error);
            throw error;
        }
    }

    /**
     * Add a message to an existing chat
     * @param {string} chatId - Chat ID
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - Message content
     */
    async addMessage(chatId, role, content) {
        try {
            const chatRef = doc(db, this.COLLECTION, chatId);
            const chatDoc = await getDoc(chatRef);

            if (!chatDoc.exists()) {
                throw new Error('Chat not found');
            }

            const currentMessages = chatDoc.data().messages || [];
            currentMessages.push({
                role,
                content,
                timestamp: new Date().toISOString()
            });

            await updateDoc(chatRef, {
                messages: currentMessages,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error adding message:', error);
            throw error;
        }
    }

    /**
     * Load all chats (synced across all devices)
     * @param {boolean} includeArchived - Include archived chats
     * @returns {Array} Array of chat objects
     */
    async loadChats(includeArchived = true) {
        try {
            const q = query(
                collection(db, this.COLLECTION),
                orderBy('updatedAt', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const chats = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Sync all chats across all devices (no deviceId filter)
                if (includeArchived || !data.archived) {
                    chats.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date(),
                        updatedAt: data.updatedAt?.toDate?.() || new Date()
                    });
                }
            });

            return chats;
        } catch (error) {
            console.error('Error loading chats:', error);
            return [];
        }
    }

    /**
     * Load a single chat by ID
     * @param {string} chatId - Chat ID
     * @returns {Object|null} Chat object or null
     */
    async loadChat(chatId) {
        try {
            const chatRef = doc(db, this.COLLECTION, chatId);
            const chatDoc = await getDoc(chatRef);

            if (!chatDoc.exists()) {
                return null;
            }

            const data = chatDoc.data();
            return {
                id: chatDoc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                updatedAt: data.updatedAt?.toDate?.() || new Date()
            };
        } catch (error) {
            console.error('Error loading chat:', error);
            return null;
        }
    }

    /**
     * Delete a chat
     * @param {string} chatId - Chat ID
     */
    async deleteChat(chatId) {
        try {
            await deleteDoc(doc(db, this.COLLECTION, chatId));
            console.log('Chat deleted:', chatId);
        } catch (error) {
            console.error('Error deleting chat:', error);
            throw error;
        }
    }

    /**
     * Archive a chat
     * @param {string} chatId - Chat ID
     */
    async archiveChat(chatId) {
        try {
            await this.updateChat(chatId, { archived: true });
            console.log('Chat archived:', chatId);
        } catch (error) {
            console.error('Error archiving chat:', error);
            throw error;
        }
    }

    /**
     * Unarchive a chat
     * @param {string} chatId - Chat ID
     */
    async unarchiveChat(chatId) {
        try {
            await this.updateChat(chatId, { archived: false });
            console.log('Chat unarchived:', chatId);
        } catch (error) {
            console.error('Error unarchiving chat:', error);
            throw error;
        }
    }

    /**
     * Generate title from first message
     * @param {string} message - First user message
     * @returns {string} Generated title
     */
    generateTitle(message) {
        // Take first 50 chars of first message
        const title = message.substring(0, 50).trim();
        return title.length < message.length ? title + '...' : title;
    }
}

// Export singleton instance
const chatStorage = new ChatStorage();
export { chatStorage, ChatStorage };
