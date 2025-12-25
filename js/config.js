const config = {
    // Groq API Key - Loaded from env.js or environment variables
    GROQ_API_KEY: '',

    // Available models for the dropdown
    AVAILABLE_MODELS: [
        {
            id: 'openai/gpt-oss-120b',
            name: 'GPT-OSS 120B',
            description: 'OpenAI GPT Open Source 120B'
        },
        {
            id: 'llama-3.3-70b-versatile',
            name: 'LLaMA 3.3 70B',
            description: 'Meta LLaMA 3.3 70B Versatile'
        }
    ],

    // Default model
    DEFAULT_MODEL: 'openai/gpt-oss-120b',

    // API Settings
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    MAX_TOKENS: 3072,
    TEMPERATURE: 0.7
};

// Try to load from window.ENV if available (for Netlify/production injection)
if (window.ENV && window.ENV.GROQ_API_KEY) {
    config.GROQ_API_KEY = window.ENV.GROQ_API_KEY;
}

export default config;
