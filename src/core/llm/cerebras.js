const axios = require('axios');
const { LLMProvider } = require('./provider');
require('dotenv').config({ path: '.env.local' });

class CerebrasProvider extends LLMProvider {
  constructor() {
    super('Cerebras');
    this.apiKey = process.env.CEREBRAS_API_KEY;
    this.baseURL = process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';
    this.model = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';

    if (!this.apiKey) {
      throw new Error('CEREBRAS_API_KEY is not defined in the environment variables.');
    }
  }

  async generate(systemPrompt, userPrompt, jsonMode = false) {
    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    };

    if (jsonMode) {
      payload.response_format = { type: "json_object" };
    }

    try {
      const response = await axios.post(`${this.baseURL}/chat/completions`, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000 // 25 seconds timeout
      });

      const messageContent = response.data.choices[0].message.content;
      
      if (jsonMode) {
        return JSON.parse(messageContent);
      }
      return messageContent;
    } catch (error) {
      const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
      throw new Error(`Cerebras API Error: ${errorMsg}`);
    }
  }
}

module.exports = { CerebrasProvider };
