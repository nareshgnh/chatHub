/**
 * Chat Indexer - RAG for Conversation History
 * Indexes chat messages for context retrieval
 * 
 * Based on content-indexer.js from LearningHub
 */

class ChatIndexer {
    constructor() {
        this.chunks = [];
        this.keywordIndex = new Map();
        this.documentFrequency = new Map();
        this.isIndexed = false;

        // Configuration
        this.CHUNK_SIZE = 800;
        this.CHUNK_OVERLAP = 150;
        this.TOP_K = 4;
        this.MAX_CONTEXT_CHARS = 3000;

        // Stop words to ignore
        this.STOP_WORDS = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
            'it', 'its', 'you', 'your', 'we', 'our', 'they', 'their', 'he', 'she',
            'his', 'her', 'i', 'my', 'me', 'can', 'just', 'so', 'as', 'if', 'then',
            'than', 'when', 'what', 'which', 'who', 'how', 'all', 'each', 'every',
            'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
            'only', 'same', 'into', 'from', 'up', 'down', 'out', 'about', 'after',
            'before', 'between', 'through', 'during', 'above', 'below'
        ]);
    }

    /**
     * Index conversation history for RAG retrieval
     * @param {Array} messages - Array of {role, content} message objects
     * @returns {number} Number of chunks created
     */
    indexConversation(messages) {
        if (!messages || messages.length === 0) {
            return 0;
        }

        // Reset index
        this.chunks = [];
        this.keywordIndex.clear();
        this.documentFrequency.clear();

        // Convert messages to text with role labels
        const conversationText = messages.map((msg, idx) => {
            const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
            return `[${role}]: ${msg.content}`;
        }).join('\n\n');

        // Create chunks from conversation
        this.chunks = this.createChunks(conversationText);

        // Build keyword index
        this.buildKeywordIndex();

        this.isIndexed = true;
        console.log(`[ChatIndexer] Indexed ${this.chunks.length} chunks from ${messages.length} messages`);

        return this.chunks.length;
    }

    /**
     * Create overlapping chunks from text
     */
    createChunks(content) {
        const chunks = [];
        let start = 0;
        let iterations = 0;
        const maxIterations = 5000;

        while (start < content.length && iterations < maxIterations) {
            iterations++;

            let end = Math.min(start + this.CHUNK_SIZE, content.length);

            // Try to break at message boundary
            if (end < content.length) {
                const searchStart = Math.max(start + this.CHUNK_SIZE - 100, start);
                const breakPoints = ['\n\n[USER]:', '\n\n[ASSISTANT]:', '. ', '\n'];
                let bestBreak = -1;

                for (const bp of breakPoints) {
                    const pos = content.lastIndexOf(bp, end);
                    if (pos > searchStart && pos > bestBreak) {
                        bestBreak = pos + (bp === '. ' ? 2 : bp.length);
                    }
                }

                if (bestBreak > start) {
                    end = bestBreak;
                }
            }

            const chunkText = content.substring(start, end).trim();

            if (chunkText.length > 30) {
                chunks.push({
                    id: chunks.length,
                    text: chunkText,
                    start: start,
                    end: end,
                    keywords: this.extractKeywords(chunkText)
                });
            }

            const newStart = end - this.CHUNK_OVERLAP;
            start = Math.max(start + 1, newStart);

            if (start >= content.length - 30) break;
        }

        return chunks;
    }

    /**
     * Extract keywords from text
     */
    extractKeywords(text) {
        const words = text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word =>
                word.length > 2 &&
                !this.STOP_WORDS.has(word) &&
                !/^\d+$/.test(word)
            );

        const wordFreq = new Map();
        for (const word of words) {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }

        return wordFreq;
    }

    /**
     * Build inverted index for keyword lookup
     */
    buildKeywordIndex() {
        for (const chunk of this.chunks) {
            for (const [keyword, _] of chunk.keywords) {
                if (!this.keywordIndex.has(keyword)) {
                    this.keywordIndex.set(keyword, []);
                }
                this.keywordIndex.get(keyword).push(chunk.id);

                this.documentFrequency.set(
                    keyword,
                    (this.documentFrequency.get(keyword) || 0) + 1
                );
            }
        }
    }

    /**
     * Search for relevant chunks using TF-IDF
     */
    search(query, topK = this.TOP_K) {
        if (!this.isIndexed || this.chunks.length === 0) {
            return [];
        }

        const queryKeywords = this.extractKeywords(query);

        if (queryKeywords.size === 0) {
            // Return most recent chunks if no keywords
            return this.chunks.slice(-topK);
        }

        const scores = new Map();
        const N = this.chunks.length;

        for (const chunk of this.chunks) {
            let score = 0;

            for (const [queryWord, queryFreq] of queryKeywords) {
                if (chunk.keywords.has(queryWord)) {
                    const tf = chunk.keywords.get(queryWord);
                    const df = this.documentFrequency.get(queryWord) || 1;
                    const idf = Math.log(N / df);
                    score += tf * idf * queryFreq;
                }
            }

            // Boost recent messages slightly
            const recencyBoost = 1 + (chunk.id / N) * 0.3;
            score *= recencyBoost;

            if (score > 0) {
                scores.set(chunk.id, score);
            }
        }

        const sortedChunks = [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK)
            .map(([id, _]) => this.chunks[id]);

        // Sort by position for coherent reading
        return sortedChunks.sort((a, b) => a.start - b.start);
    }

    /**
     * Get relevant context for a query
     */
    getContextForQuery(query) {
        const relevantChunks = this.search(query);

        if (relevantChunks.length === 0) {
            return '';
        }

        let context = '';
        for (const chunk of relevantChunks) {
            if (context.length + chunk.text.length > this.MAX_CONTEXT_CHARS) {
                const remaining = this.MAX_CONTEXT_CHARS - context.length - 10;
                if (remaining > 50) {
                    context += '\n...\n' + chunk.text.substring(0, remaining) + '...';
                }
                break;
            }
            context += (context ? '\n\n' : '') + chunk.text;
        }

        return context;
    }

    /**
     * Clear the index
     */
    clear() {
        this.chunks = [];
        this.keywordIndex.clear();
        this.documentFrequency.clear();
        this.isIndexed = false;
    }
}

// Export singleton
const chatIndexer = new ChatIndexer();
export { chatIndexer, ChatIndexer };
