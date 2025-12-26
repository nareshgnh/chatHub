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
        // Model will be loaded from Firebase in init()
        this.currentModel = null;
        this.longPressTimer = null;
        this.selectedChatId = null;
        this.suggestionsContainer = null;

        // Initialize
        this.init();
    }

    async init() {
        // Setup event listeners
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Keyboard: Enter adds newline, button sends (mobile-friendly)
        // On desktop, keep Shift+Enter for newline, Enter to send
        this.inputField.addEventListener('keydown', (e) => {
            // Mobile: let Enter add newlines naturally, use send button
            // Desktop: Shift+Enter for newline, Enter to send
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.inputField.addEventListener('input', () => {
            this.inputField.style.height = 'auto';
            this.inputField.style.height = Math.min(this.inputField.scrollHeight, 200) + 'px';
        });

        // Load model from Firebase first, then populate selector
        await this.loadModelFromFirebase();
        this.populateModelSelector();

        // Model selector change handler
        this.modelSelector.addEventListener('change', async (e) => {
            this.currentModel = e.target.value;
            // Save to localStorage (instant) and Firebase (sync across devices)
            localStorage.setItem('chatHub_selectedModel', this.currentModel);
            chatStorage.saveSelectedModel(this.currentModel); // Don't await, let it sync in background
            this.showSystemMessage(`Switched to ${this.getModelName(this.currentModel)}`);
        });

        // New chat buttons
        this.newChatBtn.addEventListener('click', () => this.startNewChat());
        if (this.newChatTopBtn) {
            this.newChatTopBtn.addEventListener('click', () => this.startNewChat());
        }

        // Sidebar toggle
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile) {
                    this.toggleSidebar(true); // Open sidebar on mobile
                } else {
                    this.sidebar.classList.remove('collapsed'); // Expand on desktop
                    localStorage.setItem('chatHub_sidebarCollapsed', 'false');
                }
            });
        }
        if (this.closeSidebarBtn) {
            // On desktop, this toggles collapse; on mobile, it closes
            this.closeSidebarBtn.addEventListener('click', () => {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile) {
                    this.toggleSidebar(false);
                } else {
                    this.toggleSidebar(); // Toggle (no argument)
                }
            });
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));
        }

        // Restore sidebar state on desktop (default is expanded)
        if (!window.matchMedia('(max-width: 768px)').matches) {
            const isCollapsed = localStorage.getItem('chatHub_sidebarCollapsed');
            // Only collapse if explicitly set to 'true', otherwise keep expanded
            if (isCollapsed === 'true') {
                this.sidebar.classList.add('collapsed');
            } else {
                this.sidebar.classList.remove('collapsed');
            }
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

        // Setup dynamic suggestions
        this.setupSuggestions();

        // Close context menu on click outside
        document.addEventListener('click', () => this.hideContextMenu());

        // Pull-to-refresh setup for mobile PWA
        this.setupPullToRefresh();

        // Scroll-to-hide for mobile (maximize reading space)
        this.setupScrollToHide();

        // Load saved data from Firebase
        await this.loadChatHistory();
        this.loadCurrentChat();

        // Load dynamic suggestions
        await this.loadSuggestions();

        // Show welcome if empty
        this.updateWelcomeVisibility();

        // Focus input
        this.inputField.focus();
    }

    // ========================================
    // Firebase Model Sync
    // ========================================
    async loadModelFromFirebase() {
        try {
            // First check localStorage (instant)
            const localModel = localStorage.getItem('chatHub_selectedModel');
            if (localModel && config.AVAILABLE_MODELS.some(m => m.id === localModel)) {
                this.currentModel = localModel;
                console.log('Loaded model from localStorage:', localModel);
                return;
            }

            // Fallback to Firebase (for cross-device sync)
            const savedModel = await chatStorage.getSelectedModel();
            if (savedModel && config.AVAILABLE_MODELS.some(m => m.id === savedModel)) {
                this.currentModel = savedModel;
                // Also cache to localStorage for next time
                localStorage.setItem('chatHub_selectedModel', savedModel);
                console.log('Loaded model from Firebase:', savedModel);
            } else {
                this.currentModel = config.DEFAULT_MODEL;
                console.log('Using default model:', config.DEFAULT_MODEL);
            }
        } catch (error) {
            console.error('Error loading model from Firebase:', error);
            this.currentModel = config.DEFAULT_MODEL;
        }
    }

    // ========================================
    // Dynamic Personalized Suggestions
    // ========================================
    setupSuggestions() {
        this.suggestionsContainer = document.querySelector('.welcome-suggestions');

        // Add refresh button handler
        const refreshBtn = document.getElementById('refreshSuggestionsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.refreshSuggestions();
            });
        }

        // Add click handlers for dynamic suggestion cards
        this.suggestionsContainer?.addEventListener('click', (e) => {
            const card = e.target.closest('.suggestion-card');
            if (card) {
                const prompt = card.dataset.prompt;
                if (prompt) {
                    this.inputField.value = prompt;
                    this.sendMessage();
                }
            }
        });
    }

    async loadSuggestions() {
        try {
            // First, try to load from localStorage (fast, no network)
            const cached = localStorage.getItem('chatHub_suggestions');
            const cachedDate = localStorage.getItem('chatHub_suggestionsDate');
            const today = new Date().toDateString();

            if (cached && cachedDate === today) {
                // Use locally cached suggestions from today
                const suggestions = JSON.parse(cached);
                if (Array.isArray(suggestions) && suggestions.length > 0) {
                    this.renderSuggestions(suggestions);
                    console.log('Loaded suggestions from cache');
                    return;
                }
            }

            // If no local cache, try Firebase (for cross-device sync)
            const saved = await chatStorage.getSavedSuggestions();
            if (saved && saved.generatedDate && saved.generatedDate.toDateString() === today && saved.suggestions?.length > 0) {
                // Cache locally and render
                localStorage.setItem('chatHub_suggestions', JSON.stringify(saved.suggestions));
                localStorage.setItem('chatHub_suggestionsDate', today);
                this.renderSuggestions(saved.suggestions);
                console.log('Loaded suggestions from Firebase');
                return;
            }

            // No valid cache found - render defaults for now
            // User can click refresh to generate personalized ones
            this.renderDefaultSuggestions();
            console.log('Using default suggestions');
        } catch (error) {
            console.error('Error loading suggestions:', error);
            this.renderDefaultSuggestions();
        }
    }

    async refreshSuggestions() {
        const refreshBtn = document.getElementById('refreshSuggestionsBtn');
        if (refreshBtn) {
            refreshBtn.innerHTML = '⟳';
            refreshBtn.classList.add('spinning');
        }

        try {
            await this.generatePersonalizedSuggestions();
            this.showSystemMessage('✨ New suggestions generated!');
        } catch (error) {
            console.error('Error refreshing suggestions:', error);
            this.showSystemMessage('Failed to refresh suggestions');
        } finally {
            if (refreshBtn) {
                refreshBtn.innerHTML = '🔄';
                refreshBtn.classList.remove('spinning');
            }
        }
    }

    async generatePersonalizedSuggestions() {
        try {
            // Get condensed topics from recent chats
            const recentTopics = await chatStorage.getRecentTopics(10);

            if (!recentTopics) {
                // No chat history, use defaults
                this.renderDefaultSuggestions();
                return;
            }

            // Use AI to generate personalized suggestions (minimal tokens)
            const apiKey = config.GROQ_API_KEY;
            if (!apiKey) {
                this.renderDefaultSuggestions();
                return;
            }

            const response = await fetch(config.API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'system',
                            content: `Generate 4 personalized question suggestions based on user's interests. Return ONLY a JSON array with objects having "title" (2-4 words with emoji), "description" (short phrase), and "prompt" (full question). No markdown, just JSON.`
                        },
                        {
                            role: 'user',
                            content: `Recent topics:\n${recentTopics}\n\nGenerate 4 diverse follow-up questions I might want to explore.`
                        }
                    ],
                    model: 'llama-3.1-8b-instant', // Use fast model for suggestions
                    temperature: 0.8,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                throw new Error('API request failed');
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content || '';

            // Parse JSON from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const suggestions = JSON.parse(jsonMatch[0]);
                if (Array.isArray(suggestions) && suggestions.length > 0) {
                    // Save to localStorage (fast) and Firebase (sync)
                    const today = new Date().toDateString();
                    localStorage.setItem('chatHub_suggestions', JSON.stringify(suggestions));
                    localStorage.setItem('chatHub_suggestionsDate', today);
                    chatStorage.saveSuggestions(suggestions); // Don't await, let it happen in background
                    this.renderSuggestions(suggestions);
                    return;
                }
            }

            // Fallback if parsing fails
            this.renderDefaultSuggestions();
        } catch (error) {
            console.error('Error generating suggestions:', error);
            this.renderDefaultSuggestions();
        }
    }

    renderSuggestions(suggestions) {
        if (!this.suggestionsContainer) return;

        const html = suggestions.map(s => `
            <div class="suggestion-card" 
                 data-prompt="${this.escapeHtml(s.prompt)}"
                 tabindex="0"
                 role="button"
                 aria-label="${this.escapeHtml(s.title)}: ${this.escapeHtml(s.description)}">
                <div class="suggestion-title">${this.escapeHtml(s.title)}</div>
                <div class="suggestion-desc">${this.escapeHtml(s.description)}</div>
            </div>
        `).join('');

        this.suggestionsContainer.innerHTML = html;

        // Add keyboard support for suggestion cards
        this.suggestionsContainer.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const prompt = card.dataset.prompt;
                    if (prompt) {
                        this.inputField.value = prompt;
                        this.sendMessage();
                    }
                }
            });
        });
    }


    renderDefaultSuggestions() {
        const defaults = [
            { title: '💡 Explain a concept', description: 'Learn something new', prompt: 'Explain a programming concept I should know' },
            { title: '✍️ Write code', description: 'Get coding help', prompt: 'Help me write efficient code' },
            { title: '📚 Best practices', description: 'Industry standards', prompt: 'What are best practices for software development?' },
            { title: '🐛 Debug help', description: 'Fix issues fast', prompt: 'Help me debug my code' }
        ];
        this.renderSuggestions(defaults);
    }

    // ========================================
    // Pull-to-Refresh for Mobile PWA
    // ========================================
    setupPullToRefresh() {
        let startY = 0;
        let isPulling = false;
        const threshold = 80;

        this.chatArea.addEventListener('touchstart', (e) => {
            if (this.chatArea.scrollTop === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });

        this.chatArea.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            const pullDistance = currentY - startY;

            if (pullDistance > 30 && this.chatArea.scrollTop === 0) {
                // Show pull indicator
                if (!document.querySelector('.pull-refresh-indicator')) {
                    const indicator = document.createElement('div');
                    indicator.className = 'pull-refresh-indicator';
                    indicator.innerHTML = pullDistance > threshold ? '↻ Release to refresh' : '↓ Pull to refresh';
                    this.chatArea.insertBefore(indicator, this.chatArea.firstChild);
                } else {
                    document.querySelector('.pull-refresh-indicator').innerHTML =
                        pullDistance > threshold ? '↻ Release to refresh' : '↓ Pull to refresh';
                }
            }
        }, { passive: true });

        this.chatArea.addEventListener('touchend', async () => {
            const indicator = document.querySelector('.pull-refresh-indicator');

            if (indicator && indicator.innerHTML.includes('Release')) {
                indicator.innerHTML = '⟳ Refreshing...';
                try {
                    await this.loadChatHistory();
                    this.showSystemMessage('Synced from cloud ✓');
                } catch (error) {
                    console.error('Refresh failed:', error);
                }
            }

            if (indicator) {
                setTimeout(() => indicator.remove(), 500);
            }
            isPulling = false;
        }, { passive: true });
    }

    // ========================================
    // Scroll-to-Hide for Mobile (maximize reading space)
    // ========================================
    setupScrollToHide() {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) return;

        const topBar = document.querySelector('.top-bar');
        const inputContainer = document.querySelector('.input-container');
        let lastScrollTop = 0;
        let scrollThreshold = 50; // Minimum scroll before triggering

        this.chatArea.addEventListener('scroll', () => {
            const scrollTop = this.chatArea.scrollTop;
            const scrollHeight = this.chatArea.scrollHeight;
            const clientHeight = this.chatArea.clientHeight;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

            // At bottom - always show both bars for typing
            if (isAtBottom) {
                topBar?.classList.remove('scroll-hidden');
                inputContainer?.classList.remove('scroll-hidden');
                lastScrollTop = scrollTop;
                return;
            }

            const scrollDelta = scrollTop - lastScrollTop;

            // Scrolling down (reading more content) - hide bars
            if (scrollDelta > scrollThreshold) {
                topBar?.classList.add('scroll-hidden');
                inputContainer?.classList.add('scroll-hidden');
                lastScrollTop = scrollTop;
            }
            // Scrolling up (going back) - show bars
            else if (scrollDelta < -scrollThreshold) {
                topBar?.classList.remove('scroll-hidden');
                inputContainer?.classList.remove('scroll-hidden');
                lastScrollTop = scrollTop;
            }
        }, { passive: true });

        // Also show bars when input is focused
        this.inputField.addEventListener('focus', () => {
            topBar?.classList.remove('scroll-hidden');
            inputContainer?.classList.remove('scroll-hidden');
        });
    }

    populateModelSelector() {
        this.modelSelector.innerHTML = config.AVAILABLE_MODELS.map(model =>
            `<option value="${model.id}" ${model.id === this.currentModel ? 'selected' : ''}>
                ${model.name}
            </option>`
        ).join('');
    }

    getModelName(modelId) {
        const model = config.AVAILABLE_MODELS.find(m => m.id === modelId);
        return model ? model.name : modelId;
    }

    toggleSidebar(show) {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        if (isMobile) {
            // Mobile: slide in/out with overlay
            if (show) {
                this.sidebar.classList.add('open');
                this.sidebarOverlay.classList.add('visible');
            } else {
                this.sidebar.classList.remove('open');
                this.sidebarOverlay.classList.remove('visible');
            }
        } else {
            // Desktop: collapse/expand sidebar
            if (show === undefined) {
                // Toggle based on current state
                this.sidebar.classList.toggle('collapsed');
            } else if (show) {
                this.sidebar.classList.remove('collapsed');
            } else {
                this.sidebar.classList.add('collapsed');
            }
            // Save preference
            localStorage.setItem('chatHub_sidebarCollapsed', this.sidebar.classList.contains('collapsed'));
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

        // Render message to DOM FIRST (before async Firebase save)
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
            // AI response - no sender label
            msgDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-text"></div>
                </div>
            `;
            const textEl = msgDiv.querySelector('.message-text');
            textEl.innerHTML = this.renderMarkdown(content);
            this.wrapTables(textEl);
            this.highlightCode(textEl);
        }

        this.messagesContainer.appendChild(msgDiv);
        this.scrollToBottom();

        // Save to Firebase AFTER DOM update (non-blocking)
        if (this.currentChatId) {
            chatStorage.addMessage(this.currentChatId, role, content).then(() => {
                // Update title if first user message
                if (role === 'user' && this.messages.filter(m => m.role === 'user').length === 1) {
                    const title = chatStorage.generateTitle(content);
                    chatStorage.updateChat(this.currentChatId, { title });
                    this.loadChatHistory(); // Refresh list
                }
            }).catch(error => {
                console.error('Failed to save message:', error);
            });
        }

        return msgDiv.querySelector('.message-text');
    }

    updateAssistantMessage(textEl, content) {
        textEl.innerHTML = this.renderMarkdown(content);
        this.wrapTables(textEl);
        this.highlightCode(textEl);
        this.scrollToBottom();
    }

    // Wrap tables in scrollable container for mobile
    wrapTables(container) {
        container.querySelectorAll('table').forEach(table => {
            if (!table.parentElement.classList.contains('table-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
    }

    renderMarkdown(text) {
        // Preprocess: Fix common AI markdown issues
        let processed = (text || '')
            // Fix various quote characters to backticks (AI models sometimes output smart quotes)
            .replace(/['']{3}/g, '```')   // Curly single quotes
            .replace(/[""]{3}/g, '```')   // Curly double quotes  
            .replace(/'{3}/g, '```')      // Straight single quotes
            .replace(/"{3}/g, '```')      // Straight double quotes
            // Fix headers without space: ###Header -> ### Header
            .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
            // Fix incomplete bold markers at end of stream: ** without closing **
            .replace(/\*\*([^*]*)$/, '**$1**')
            // Fix headers with incomplete bold: ### ** Text -> ### **Text**
            .replace(/^(#{1,6}\s+)\*\*\s+/gm, '$1**');

        // Handle unclosed code blocks during streaming
        const codeBlockMatches = processed.match(/```/g) || [];
        if (codeBlockMatches.length % 2 !== 0) {
            // Odd number of code fences = unclosed block, add closing fence
            processed += '\n```';
        }

        // Use markdown-it if available (preferred)
        if (typeof markdownit !== 'undefined') {
            const md = markdownit({
                html: false,        // Disable HTML for security
                breaks: true,       // Convert \n to <br>
                linkify: true,      // Auto-convert URLs to links
                typographer: false  // Disable smart quotes
            });
            return md.render(processed);
        }

        // Fallback: use marked if available
        if (typeof marked !== 'undefined') {
            marked.setOptions({ gfm: true, breaks: true, tables: true });
            try {
                return marked.parse(processed);
            } catch (e) {
                console.error('Markdown parse error:', e);
            }
        }

        // Ultimate fallback: manual regex parsing
        return processed
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
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

RESPONSE STYLE RULES:
1. Be CONCISE by default - give direct, clear answers
2. Only give detailed/step-by-step responses when the user explicitly asks for explanations, tutorials, or comprehensive coverage
3. Use relevant emojis for section headers and key points (e.g., 📌 for important notes, ✅ for steps, 💡 for tips, ⚠️ for warnings)
4. Use code examples when relevant, properly formatted in markdown code blocks
5. Use tables ONLY when comparing items or when it genuinely improves readability (not for simple lists)
6. Format responses in clean Markdown with proper headers, bullet points, and emphasis
7. Match response length to question complexity - simple questions get simple answers`;

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
        // Only close sidebar on mobile
        if (window.matchMedia('(max-width: 768px)').matches) {
            this.toggleSidebar(false);
        }
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
                            <div class="message-text"></div>
                        </div>
                    `;
                    const textEl = msgDiv.querySelector('.message-text');
                    textEl.innerHTML = this.renderMarkdown(msg.content);
                    this.wrapTables(textEl);
                    this.highlightCode(textEl);
                }

                this.messagesContainer.appendChild(msgDiv);
            }

            this.scrollToBottom();
            this.renderChatList();
            // Only close sidebar on mobile
            if (window.matchMedia('(max-width: 768px)').matches) {
                this.toggleSidebar(false);
            }
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
