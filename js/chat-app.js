/**
 * ChatHub - Main Chat Application
 * ChatGPT-like interface with Firebase persistence and enhanced mobile features
 */

import config from './config.js';
import { chatIndexer } from './chat-indexer.js';
import { chatStorage } from './chat-storage.js';

class ChatApp {
    constructor() {
        // DOM Elements
        this.messagesContainer = document.getElementById('chatMessages');
        this.chatArea = document.getElementById('chatArea');
        this.inputField = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.modelSelector = document.getElementById('modelSelector');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.newChatTopBtn = document.getElementById('newChatTopBtn');
        this.welcomeScreen = document.getElementById('welcomeScreen');

        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.menuToggle = document.getElementById('menuToggle');
        this.closeSidebarBtn = document.getElementById('closeSidebarBtn');
        this.chatList = document.getElementById('chatList');
        this.chatSearch = document.getElementById('chatSearch');
        this.recentChatsSection = document.getElementById('recentChats');
        this.archivedChatsSection = document.getElementById('archivedChats');

        // Context menu
        this.contextMenu = document.getElementById('chatContextMenu');

        // State
        this.messages = [];
        this.chatHistory = [];
        this.archivedChats = [];
        this.currentChatId = null;
        this.isLoading = false;
        this.currentModel = config.DEFAULT_MODEL;
        this.longPressTimer = null;
        this.selectedChatId = null;

        // Initialize
        this.init();
    }

    async init() {
        // Setup event listeners
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.inputField.addEventListener('input', () => {
            this.inputField.style.height = 'auto';
            this.inputField.style.height = Math.min(this.inputField.scrollHeight, 200) + 'px';
        });

        // Model selector
        this.populateModelSelector();
        this.modelSelector.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            this.showSystemMessage(`Switched to ${this.getModelName(this.currentModel)}`);
        });

        // New chat buttons
        this.newChatBtn.addEventListener('click', () => this.startNewChat());
        if (this.newChatTopBtn) {
            this.newChatTopBtn.addEventListener('click', () => this.startNewChat());
        }

        // Sidebar toggle
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => this.toggleSidebar(true));
        }
        if (this.closeSidebarBtn) {
            this.closeSidebarBtn.addEventListener('click', () => this.toggleSidebar(false));
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));
        }

        // Search functionality
        if (this.chatSearch) {
            this.chatSearch.addEventListener('input', (e) => this.filterChats(e.target.value));
        }

        // Context menu handlers
        this.setupContextMenu();

        // Archived section toggle
        if (this.archivedChatsSection) {
            const title = this.archivedChatsSection.querySelector('.chat-list-title');
            if (title) {
                title.addEventListener('click', () => {
                    this.archivedChatsSection.classList.toggle('expanded');
                });
            }
        }

        // Suggestion cards
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                if (prompt) {
                    this.inputField.value = prompt;
                    this.sendMessage();
                }
            });
        });

        // Close context menu on click outside
        document.addEventListener('click', () => this.hideContextMenu());

        // Load saved data from Firebase
        await this.loadChatHistory();
        this.loadCurrentChat();

        // Show welcome if empty
        this.updateWelcomeVisibility();

        // Focus input
        this.inputField.focus();
    }

    populateModelSelector() {
        this.modelSelector.innerHTML = config.AVAILABLE_MODELS.map(model =>
            `<option value="${model.id}" ${model.id === config.DEFAULT_MODEL ? 'selected' : ''}>
                ${model.name}
            </option>`
        ).join('');
    }

    getModelName(modelId) {
        const model = config.AVAILABLE_MODELS.find(m => m.id === modelId);
        return model ? model.name : modelId;
    }

    toggleSidebar(show) {
        if (show) {
            this.sidebar.classList.add('open');
            this.sidebarOverlay.classList.add('visible');
        } else {
            this.sidebar.classList.remove('open');
            this.sidebarOverlay.classList.remove('visible');
        }
    }

    updateWelcomeVisibility() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = this.messages.length === 0 ? 'flex' : 'none';
        }
    }

    showSystemMessage(text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        msgDiv.innerHTML = `
            <div class="message-content">
                <div class="message-body" style="text-align: center;">
                    <span style="color: var(--text-tertiary); font-size: 14px;">${text}</span>
                </div>
            </div>
        `;
        this.messagesContainer.appendChild(msgDiv);
        this.scrollToBottom();
        setTimeout(() => msgDiv.remove(), 3000);
    }

    // ========================================
    // Search Functionality
    // ========================================
    filterChats(query) {
        const q = query.toLowerCase().trim();
        const allItems = this.chatList.querySelectorAll('.chat-list-item');

        allItems.forEach(item => {
            const title = item.textContent.toLowerCase();
            item.style.display = title.includes(q) ? 'flex' : 'none';
        });
    }

    // ========================================
    // Context Menu (Long-press)
    // ========================================
    setupContextMenu() {
        // Setup context menu action buttons
        this.contextMenu.querySelectorAll('.context-menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'delete') {
                    this.deleteChatById(this.selectedChatId);
                } else if (action === 'archive') {
                    this.archiveChatById(this.selectedChatId);
                }
                this.hideContextMenu();
            });
        });
    }

    showContextMenu(x, y, chatId) {
        this.selectedChatId = chatId;

        // Check if this is an archived chat
        const isArchived = this.archivedChats.some(c => c.id === chatId);
        const archiveBtn = this.contextMenu.querySelector('[data-action="archive"]');
        if (archiveBtn) {
            archiveBtn.innerHTML = isArchived ? '<span>📤</span> Unarchive' : '<span>📦</span> Archive';
        }

        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
        this.selectedChatId = null;
    }

    async deleteChatById(chatId) {
        if (!chatId) return;

        try {
            await chatStorage.deleteChat(chatId);

            // Remove from local arrays
            this.chatHistory = this.chatHistory.filter(c => c.id !== chatId);
            this.archivedChats = this.archivedChats.filter(c => c.id !== chatId);

            // If current chat was deleted, start new
            if (this.currentChatId === chatId) {
                this.startNewChat();
            }

            this.renderChatList();
            this.showSystemMessage('Chat deleted');
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    async archiveChatById(chatId) {
        if (!chatId) return;

        try {
            const isArchived = this.archivedChats.some(c => c.id === chatId);

            if (isArchived) {
                await chatStorage.unarchiveChat(chatId);
                const chat = this.archivedChats.find(c => c.id === chatId);
                this.archivedChats = this.archivedChats.filter(c => c.id !== chatId);
                if (chat) {
                    chat.archived = false;
                    this.chatHistory.unshift(chat);
                }
                this.showSystemMessage('Chat unarchived');
            } else {
                await chatStorage.archiveChat(chatId);
                const chat = this.chatHistory.find(c => c.id === chatId);
                this.chatHistory = this.chatHistory.filter(c => c.id !== chatId);
                if (chat) {
                    chat.archived = true;
                    this.archivedChats.unshift(chat);
                }
                this.showSystemMessage('Chat archived');
            }

            this.renderChatList();
        } catch (error) {
            console.error('Archive error:', error);
        }
    }

    // ========================================
    // Message Handling
    // ========================================
    async sendMessage() {
        const text = this.inputField.value.trim();
        if (!text || this.isLoading) return;

        // Hide welcome screen
        this.updateWelcomeVisibility();
        if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';

        // Clear input
        this.inputField.value = '';
        this.inputField.style.height = 'auto';

        // Auto-save: Create new chat on first message if needed
        const isFirstMessage = this.messages.length === 0;
        if (isFirstMessage && !this.currentChatId) {
            try {
                const title = chatStorage.generateTitle(text);
                const chat = await chatStorage.createChat(title, []);
                this.currentChatId = chat.id;
                console.log('Auto-created chat:', this.currentChatId);
            } catch (error) {
                console.error('Failed to auto-create chat:', error);
            }
        }

        // Add user message
        this.addMessage('user', text);

        // Show loading
        this.isLoading = true;
        this.showTypingIndicator();
        this.updateSendButton();

        try {
            // Index conversation for RAG
            if (this.messages.length > 2) {
                chatIndexer.indexConversation(this.messages.slice(0, -1));
            }

            // Get RAG context
            const ragContext = this.messages.length > 4
                ? chatIndexer.getContextForQuery(text)
                : '';

            // Call API
            await this.callGroqAPI(text, ragContext);

        } catch (error) {
            console.error('API Error:', error);
            this.removeTypingIndicator();
            this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
        } finally {
            this.isLoading = false;
            this.updateSendButton();
        }
    }

    async addMessage(role, content) {
        // Save to state
        const message = { role, content, timestamp: Date.now() };
        this.messages.push(message);

        // Save to Firebase
        if (this.currentChatId) {
            try {
                await chatStorage.addMessage(this.currentChatId, role, content);

                // Update title if first user message
                if (role === 'user' && this.messages.filter(m => m.role === 'user').length === 1) {
                    const title = chatStorage.generateTitle(content);
                    await chatStorage.updateChat(this.currentChatId, { title });
                    this.loadChatHistory(); // Refresh list
                }
            } catch (error) {
                console.error('Failed to save message:', error);
            }
        }

        // Render message
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${role}`;

        const senderName = 'ChatHub';

        if (role === 'user') {
            msgDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-bubble">${this.escapeHtml(content)}</div>
                </div>
            `;
        } else {
            msgDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-sender">${senderName}</div>
                    <div class="message-text"></div>
                </div>
            `;
            const textEl = msgDiv.querySelector('.message-text');
            textEl.innerHTML = this.renderMarkdown(content);
            this.highlightCode(textEl);
        }

        this.messagesContainer.appendChild(msgDiv);
        this.scrollToBottom();

        return msgDiv.querySelector('.message-text');
    }

    updateAssistantMessage(textEl, content) {
        textEl.innerHTML = this.renderMarkdown(content);
        this.highlightCode(textEl);
        this.scrollToBottom();
    }

    renderMarkdown(text) {
        if (typeof marked !== 'undefined') {
            return marked.parse(text || '');
        }
        return text
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    highlightCode(container) {
        if (typeof hljs !== 'undefined') {
            container.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message message-assistant typing-indicator-container';
        indicator.innerHTML = `
            <div class="message-content">
                <div class="message-sender">ChatHub</div>
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        this.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
    }

    removeTypingIndicator() {
        const indicator = this.messagesContainer.querySelector('.typing-indicator-container');
        if (indicator) indicator.remove();
    }

    updateSendButton() {
        this.sendBtn.disabled = this.isLoading;
        this.sendBtn.innerHTML = this.isLoading
            ? '<span class="spinner"></span>'
            : '➤';
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.chatArea.scrollTop = this.chatArea.scrollHeight;
        });
    }

    async callGroqAPI(question, ragContext) {
        const apiKey = config.GROQ_API_KEY;

        if (!apiKey) {
            throw new Error('API Key not configured');
        }

        let systemPrompt = `You are a helpful AI assistant. Be concise, accurate, and friendly.

RULES:
1. Answer questions directly and clearly
2. Use code examples when relevant
3. Format responses in Markdown
4. Be conversational but professional`;

        if (ragContext) {
            systemPrompt += `\n\nRELEVANT CONVERSATION HISTORY:\n"""\n${ragContext}\n"""`;
        }

        const recentMessages = this.messages.slice(-6, -1).map(m => ({
            role: m.role,
            content: m.content
        }));

        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...recentMessages,
            { role: 'user', content: question }
        ];

        const response = await fetch(config.API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: fullMessages,
                model: this.currentModel,
                temperature: config.TEMPERATURE,
                max_tokens: config.MAX_TOKENS,
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        this.removeTypingIndicator();

        // Create message placeholder
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message message-assistant';
        msgDiv.innerHTML = `
            <div class="message-content">
                <div class="message-sender">ChatHub</div>
                <div class="message-text"></div>
            </div>
        `;
        this.messagesContainer.appendChild(msgDiv);
        const textEl = msgDiv.querySelector('.message-text');

        // Stream response
        let fullResponse = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content || '';
                        if (content) {
                            fullResponse += content;
                            this.updateAssistantMessage(textEl, fullResponse);
                        }
                    } catch (e) { }
                }
            }
        }

        // Save complete message to Firebase
        const message = {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
            model: this.currentModel
        };
        this.messages.push(message);

        if (this.currentChatId) {
            try {
                await chatStorage.addMessage(this.currentChatId, 'assistant', fullResponse);
            } catch (error) {
                console.error('Failed to save assistant message:', error);
            }
        }

        return fullResponse;
    }

    // ========================================
    // Chat Management
    // ========================================
    async startNewChat() {
        // Current chat is already saved incrementally, just reset
        this.currentChatId = null;
        this.messages = [];
        localStorage.removeItem('chatHub_currentId');

        // Clear UI
        const messages = this.messagesContainer.querySelectorAll('.message');
        messages.forEach(m => m.remove());

        chatIndexer.clear();
        this.updateWelcomeVisibility();
        if (this.welcomeScreen) this.welcomeScreen.style.display = 'flex';

        // Refresh list
        await this.loadChatHistory();
        this.inputField.focus();
        this.toggleSidebar(false);
    }

    async loadChatHistory() {
        try {
            const chats = await chatStorage.loadChats(true);
            this.chatHistory = chats.filter(c => !c.archived);
            this.archivedChats = chats.filter(c => c.archived);
            this.renderChatList();
        } catch (error) {
            console.error('Failed to load chat history:', error);
            this.chatHistory = [];
            this.archivedChats = [];
        }
    }

    renderChatList() {
        // Render recent chats
        if (this.recentChatsSection) {
            const items = this.chatHistory.map(chat => this.createChatListItem(chat)).join('');
            this.recentChatsSection.innerHTML = `
                <div class="chat-list-title">Recent</div>
                ${items || '<div style="color: var(--text-muted); padding: 12px; font-size: 13px;">No chats yet</div>'}
            `;
        }

        // Render archived chats
        if (this.archivedChatsSection) {
            if (this.archivedChats.length > 0) {
                this.archivedChatsSection.style.display = 'block';
                const items = this.archivedChats.map(chat => this.createChatListItem(chat, true)).join('');
                this.archivedChatsSection.innerHTML = `
                    <div class="chat-list-title">Archived (${this.archivedChats.length})</div>
                    ${items}
                `;
            } else {
                this.archivedChatsSection.style.display = 'none';
            }
        }

        // Add event handlers
        this.chatList.querySelectorAll('.chat-list-item').forEach(item => {
            const chatId = item.dataset.id;

            // Tap to load
            item.addEventListener('click', () => {
                this.loadChatById(chatId);
            });

            // Long press for context menu (mobile)
            item.addEventListener('touchstart', (e) => {
                this.longPressTimer = setTimeout(() => {
                    const touch = e.touches[0];
                    this.showContextMenu(touch.clientX, touch.clientY, chatId);
                }, 500);
            });

            item.addEventListener('touchend', () => {
                clearTimeout(this.longPressTimer);
            });

            item.addEventListener('touchmove', () => {
                clearTimeout(this.longPressTimer);
            });

            // Right-click for context menu (desktop)
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.clientX, e.clientY, chatId);
            });
        });
    }

    createChatListItem(chat, isArchived = false) {
        const activeClass = chat.id === this.currentChatId ? 'active' : '';
        const archivedClass = isArchived ? 'archived' : '';
        return `
            <div class="chat-list-item ${activeClass} ${archivedClass}" data-id="${chat.id}">
                💬 ${this.escapeHtml(chat.title || 'New Chat')}
            </div>
        `;
    }

    async loadChatById(chatId) {
        try {
            const chat = await chatStorage.loadChat(chatId);
            if (!chat) return;

            this.currentChatId = chat.id;
            this.messages = chat.messages || [];
            localStorage.setItem('chatHub_currentId', this.currentChatId);

            // Clear and re-render
            const msgs = this.messagesContainer.querySelectorAll('.message');
            msgs.forEach(m => m.remove());
            if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';

            for (const msg of this.messages) {
                const msgDiv = document.createElement('div');
                msgDiv.className = `message message-${msg.role}`;

                if (msg.role === 'user') {
                    msgDiv.innerHTML = `
                        <div class="message-content">
                            <div class="message-bubble">${this.escapeHtml(msg.content)}</div>
                        </div>
                    `;
                } else {
                    msgDiv.innerHTML = `
                        <div class="message-content">
                            <div class="message-sender">ChatHub</div>
                            <div class="message-text"></div>
                        </div>
                    `;
                    const textEl = msgDiv.querySelector('.message-text');
                    textEl.innerHTML = this.renderMarkdown(msg.content);
                    this.highlightCode(textEl);
                }

                this.messagesContainer.appendChild(msgDiv);
            }

            this.scrollToBottom();
            this.renderChatList();
            this.toggleSidebar(false);
        } catch (error) {
            console.error('Failed to load chat:', error);
        }
    }

    loadCurrentChat() {
        const savedId = localStorage.getItem('chatHub_currentId');
        if (savedId) {
            this.loadChatById(savedId);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
});

export default ChatApp;
