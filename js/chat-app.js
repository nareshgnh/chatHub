/**
 * ChatHub - Main Chat Application
 * ChatGPT-like interface with model selection and RAG-based history
 */

import config from './config.js';
import { chatIndexer } from './chat-indexer.js';

class ChatApp {
    constructor() {
        // DOM Elements
        this.messagesContainer = document.getElementById('chatMessages');
        this.chatArea = document.getElementById('chatArea');
        this.inputField = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.modelSelector = document.getElementById('modelSelector');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.welcomeScreen = document.getElementById('welcomeScreen');

        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.menuToggle = document.getElementById('menuToggle');
        this.closeSidebarBtn = document.getElementById('closeSidebarBtn');
        this.chatList = document.getElementById('chatList');

        // State
        this.messages = [];
        this.chatHistory = []; // All saved chats
        this.currentChatId = null;
        this.isLoading = false;
        this.currentModel = config.DEFAULT_MODEL;

        // Initialize
        this.init();
    }

    init() {
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

        // New chat button
        this.newChatBtn.addEventListener('click', () => this.startNewChat());

        // Clear button
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.clearChat());
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

        // Load saved data
        this.loadChatHistory();
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

    async sendMessage() {
        const text = this.inputField.value.trim();
        if (!text || this.isLoading) return;

        // Hide welcome screen
        this.updateWelcomeVisibility();
        if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';

        // Clear input
        this.inputField.value = '';
        this.inputField.style.height = 'auto';

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

    addMessage(role, content) {
        // Save to state
        this.messages.push({ role, content, timestamp: Date.now() });
        this.saveCurrentChat();

        // Render message
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${role}`;

        const senderName = 'ChatHub';

        if (role === 'user') {
            // User messages - simple bubble on right
            msgDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-bubble">${this.escapeHtml(content)}</div>
                </div>
            `;
        } else {
            // Assistant messages - left aligned with sender name
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
        // Fallback
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
        // Use requestAnimationFrame for smoother scrolling during streaming
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

        // Save complete message
        this.messages.push({
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
            model: this.currentModel
        });
        this.saveCurrentChat();

        return fullResponse;
    }

    startNewChat() {
        // Save current chat to history if it has messages
        if (this.messages.length > 0) {
            this.saveChatToHistory();
        }

        // Generate a truly unique ID for the new chat
        this.currentChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.messages = [];
        this.saveCurrentChat();

        // Clear UI
        const messages = this.messagesContainer.querySelectorAll('.message');
        messages.forEach(m => m.remove());

        chatIndexer.clear();
        this.updateWelcomeVisibility();
        if (this.welcomeScreen) this.welcomeScreen.style.display = 'flex';

        this.inputField.focus();
        this.toggleSidebar(false);
    }

    clearChat() {
        if (confirm('Clear all chat history?')) {
            this.chatHistory = [];
            localStorage.removeItem('chatHub_history');
            this.startNewChat();
            this.renderChatList();
        }
    }

    saveChatToHistory() {
        if (this.messages.length === 0) return;

        // Title is first question, truncated
        const firstUserMsg = this.messages.find(m => m.role === 'user');
        const title = firstUserMsg?.content?.slice(0, 50) || 'New Chat';

        const chat = {
            id: this.currentChatId,
            title: title,
            messages: [...this.messages],
            updatedAt: Date.now()
        };

        // Check if this exact chat ID exists
        const existingIndex = this.chatHistory.findIndex(c => c.id === chat.id);
        if (existingIndex >= 0) {
            // Update existing
            this.chatHistory[existingIndex] = chat;
        } else {
            // Add new chat - no limit on number of chats
            this.chatHistory.unshift(chat);
        }

        localStorage.setItem('chatHub_history', JSON.stringify(this.chatHistory));
        this.renderChatList();
    }

    loadChatHistory() {
        try {
            const saved = localStorage.getItem('chatHub_history');
            if (saved) {
                this.chatHistory = JSON.parse(saved);
                this.renderChatList();
            }
        } catch (e) {
            this.chatHistory = [];
        }
    }

    renderChatList() {
        const section = this.chatList.querySelector('.chat-list-section');
        if (!section) return;

        const items = this.chatHistory.slice(0, 20).map(chat => `
            <div class="chat-list-item ${chat.id === this.currentChatId ? 'active' : ''}" data-id="${chat.id}">
                💬 ${this.escapeHtml(chat.title)}
            </div>
        `).join('');

        section.innerHTML = `
            <div class="chat-list-title">Recent</div>
            ${items || '<div style="color: var(--text-muted); padding: 12px; font-size: 13px;">No chats yet</div>'}
        `;

        // Add click handlers
        section.querySelectorAll('.chat-list-item').forEach(item => {
            item.addEventListener('click', () => {
                this.loadChatById(item.dataset.id);
            });
        });
    }

    loadChatById(chatId) {
        const chat = this.chatHistory.find(c => c.id === chatId);
        if (!chat) return;

        this.currentChatId = chat.id;
        this.messages = [...chat.messages];

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
    }

    saveCurrentChat() {
        try {
            if (!this.currentChatId) {
                this.currentChatId = Date.now().toString();
            }
            localStorage.setItem('chatHub_currentId', this.currentChatId);
            localStorage.setItem('chatHub_messages', JSON.stringify(this.messages));
        } catch (e) {
            console.warn('Failed to save:', e);
        }
    }

    loadCurrentChat() {
        try {
            this.currentChatId = localStorage.getItem('chatHub_currentId') || `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const saved = localStorage.getItem('chatHub_messages');
            if (saved) {
                this.messages = JSON.parse(saved);
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
            }
        } catch (e) {
            this.messages = [];
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
