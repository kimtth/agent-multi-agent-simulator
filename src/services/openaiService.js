class OpenAIService {
  constructor(apiKey, isAzure, endpoint, apiVersion, modelOrDeployment) {
    this.apiKey = apiKey;
    this.isAzure = isAzure;
    this.endpoint = endpoint;
    this.apiVersion = apiVersion;
    this.modelOrDeployment = modelOrDeployment;
  }

  // Method to generate agent plan - optimized
  async generateAgentPlan(goalPrompt) {
    try {
      const planningPrompt = `Based on the goal "${goalPrompt}", define a minimal set of 3-6 agents, their connections, tools, and knowledge. Return ONLY valid JSON: 
        { 
          "agents": [ 
            { "id": n, "name": "...", "role": "...", "tools": [], "knowledge": [] } 
          ], 
          "links": [ 
            { "source": id1, "target": id2 } 
          ] 
        }
        Keep descriptions concise. Ensure agents are connected in a way that enables collaboration.`;

      const response = await this.generateContent(planningPrompt);

      // Parse JSON from response
      return this.parseSimulationPlan(response);
    } catch (error) {
      console.error("Failed to generate agent plan:", error);
      throw new Error(`Failed to generate agent plan: ${error.message}`);
    }
  }

  // Method to generate agent response - optimized for conciseness
  async getAgentResponse(currentAgent, allAgents, conversationHistory, goalPrompt) {
    try {
      // Create a more concise system prompt for the agent
      const systemPrompt = `You are ${currentAgent.name}, ${currentAgent.role}. Goal: "${goalPrompt}"
        Your task is to provide a brief, focused contribution (max 3-5 sentences) that moves toward the goal.
        Be concise but insightful. Stay in character. After your message, suggest which agent (by ID number) should speak next.`;

      // Format the conversation history - limit to last 6 exchanges for efficiency
      const recentHistory = conversationHistory.slice(-6);
      const formattedHistory = recentHistory.map(entry => `${entry.agentName}: ${entry.message}`).join('\n\n');

      // Create a concise user prompt
      const userPrompt = `Conversation so far (most recent exchanges):
        ${formattedHistory || "No conversation yet."}

        As ${currentAgent.name}, provide your brief contribution (3-5 sentences maximum).
        End with a suggestion for which agent should speak next."`;

      // Generate the content response
      console.log(`Generating response for agent ${currentAgent.name}`);
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await this.generateContent(fullPrompt);

      // Parse the response to extract next agent ID
      let message = result;
      let nextAgentId = null;

      // Try to extract a next agent ID recommendation
      const nextAgentMatch = message.match(/next agent:?\s*(?:agent)?\s*#?(\d+)|(?:agent)?\s*(\d+)\s*should speak next/i);
      if (nextAgentMatch) {
        nextAgentId = parseInt(nextAgentMatch[1] || nextAgentMatch[2]);
        // Validate that the next agent ID exists
        if (!allAgents.some(agent => agent.id === nextAgentId)) {
          nextAgentId = null;
        }
      }

      return {
        message,
        nextAgentId
      };
    } catch (error) {
      console.error("Error getting agent response:", error);
      throw new Error(`Failed to get response from agent ${currentAgent.name}: ${error.message}`);
    }
  }

  // Check goal completion - improved to be more balanced and error-resistant
  async checkGoalCompletion(goalPrompt, latestMessage, conversationHistory = []) {
    try {
      // Ensure conversationHistory is an array before using array methods
      const validHistory = Array.isArray(conversationHistory) ? conversationHistory : [];

      // Get the last 10 messages for context (if available)
      const recentMessages = validHistory.length > 0
        ? validHistory.slice(-10).map(entry =>
          `${entry.agentName || 'Agent'}: ${entry.message || ''}`).join('\n\n')
        : '';

      // Prepare the system prompt for evaluation
      const systemPrompt = `You are an evaluator judging if a goal has been achieved or if there's progress.
        Goal: "${goalPrompt}"
        Be decisive and base your evaluation on clear collaboration or goal completion.
        Only consider tangible actions or contributions. Avoid prolonged discussion.
        Limit to 10 turns; if the limit is reached, respond with "YES" and stop, regardless of the current turn.`;

      // Prepare the user prompt with the most recent conversation context
      const userPrompt = `${recentMessages ? `Recent conversation:\n${recentMessages}\n\n` : ''}Latest message:
        "${latestMessage}"

        Has the goal been achieved? Respond with:
        - "YES" — goal achieved or nearly done
        - "NO" — no progress or collaboration yet

        Respond decisively with one word, followed by a clear, concise explanation (1 sentence).
        Limit to 10 turns; if the limit is reached, respond "YES" and stop, regardless of the current turn.`;

      // Generate the content response
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await this.generateContent(fullPrompt);

      // Improved logic to determine completion status - more lenient
      const isCompleted =
        result.toLowerCase().startsWith('yes') ||
        (result.toLowerCase().includes('yes') && !result.toLowerCase().includes('no, but'));

      // Also consider strong progress as partial completion - more lenient
      const hasProgress =
        result.toLowerCase().startsWith('progress') ||
        result.toLowerCase().includes('progress') ||
        (result.toLowerCase().includes('step') && result.toLowerCase().includes('toward'));

      return {
        isCompleted: isCompleted,
        hasProgress: hasProgress,
        reasoning: result
      };
    } catch (error) {
      console.error("Error checking goal completion:", error);
      return {
        isCompleted: false,
        hasProgress: false,
        reasoning: `Error checking goal completion: ${error.message}`
      };
    }
  }

  // Generate summary - optimized for conciseness
  async generateSimulationSummary(goalPrompt, conversationHistory) {
    try {
      const systemPrompt = `Create a concise, well-structured HTML summary of the agent conversation.
      Use headings, paragraphs, and bullet points. Focus on key insights and outcomes.`;

      // Format a limited portion of the conversation history to save tokens
      const significantEntries = this._selectSignificantEntries(conversationHistory);
      const formattedHistory = significantEntries.map(entry =>
        `${entry.agentName}: ${entry.message}`).join('\n\n');

      const userPrompt = `Goal: "${goalPrompt}"
      Conversation highlights:
      ${formattedHistory}

      Provide a concise summary that includes:
      1. Overview of the discussion
      2. Key decisions and insights
      3. Whether the goal was achieved
      Keep the summary brief but comprehensive.`;

      // Generate the content response
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await this.generateContent(fullPrompt);

      return result;
    } catch (error) {
      console.error("Error generating simulation summary:", error);
      return `<h2>Error Generating Summary</h2><p>An error occurred: ${error.message}</p>`;
    }
  }

  // Helper method to select significant conversation entries to save tokens
  _selectSignificantEntries(history) {
    if (!history || history.length <= 8) {
      return history; // Return all if 8 or fewer entries
    }

    // Always include first 2 and last 4 entries
    const first = history.slice(0, 2);
    const last = history.slice(-4);

    // If there are more than 10 entries, select a few from the middle
    if (history.length > 10) {
      // Select middle entries at regular intervals
      const middleCount = 4;
      const middleEntries = [];
      const start = 2;
      const end = history.length - 4;
      const step = Math.max(1, Math.floor((end - start) / (middleCount + 1)));

      for (let i = 0; i < middleCount; i++) {
        const index = start + step * (i + 1);
        if (index < end) {
          middleEntries.push(history[index]);
        }
      }

      return [...first, ...middleEntries, ...last];
    }

    // If 8-10 entries, include first 2, middle 2-4, and last 4
    const middleStart = 2;
    const middleEnd = history.length - 4;
    const middle = history.slice(middleStart, middleEnd);

    return [...first, ...middle, ...last];
  }

  // Method to select next agent
  async selectNextAgent(agents, currentAgentId, goalPrompt, conversationHistory, maxHistoryItems = 10) {
    try {
      const agentListString = agents
        .map(a => `- ID: ${a.id}, Name: ${a.name}, Role: ${a.role}`)
        .join('\n');

      const latestHistory = conversationHistory
        .map(e => `${e.agentName}: ${e.message}`)
        .slice(-maxHistoryItems)
        .join('\n');

      const currentAgent = agents.find(a => a.id === currentAgentId);
      const latestMessage = conversationHistory.length > 0 ?
        conversationHistory[conversationHistory.length - 1].message : "";

      const nextAgentPrompt = `Goal: "${goalPrompt}"
        Agents:
        ${agentListString}
        History (last ${maxHistoryItems}):
        ${latestHistory}
        Latest: "${currentAgent.name}: ${latestMessage}"
        Which agent ID should speak next? Respond ONLY with the numerical ID.`;

      const response = await this.generateContent(nextAgentPrompt);
      const parsedId = parseInt(response.trim(), 10);

      if (isNaN(parsedId) || !agents.some(a => a.id === parsedId)) {
        // Fallback to round-robin if selection fails
        const currentIndex = agents.findIndex(a => a.id === currentAgentId);
        return agents[(currentIndex + 1) % agents.length].id;
      }

      return parsedId;
    } catch (error) {
      console.error("Failed to select next agent:", error);
      // Fallback to round-robin
      const currentIndex = agents.findIndex(a => a.id === currentAgentId);
      return agents[(currentIndex + 1) % agents.length].id;
    }
  }

  // Helper method to generate content from API
  async generateContent(prompt) {
    try {
      // Handle both string prompts and message arrays
      if (typeof prompt === 'string') {
        console.log("Generating content with prompt:", prompt.substring(0, 100) + "...");
      } else if (Array.isArray(prompt)) {
        console.log("Generating content with messages array:",
          prompt.map(m => m.role + ": " + m.content.substring(0, 50) + "...").join(" | "));

        // Convert messages array to string for our existing API implementation
        const systemMessage = prompt.find(m => m.role === 'system')?.content || '';
        const userMessage = prompt.find(m => m.role === 'user')?.content || '';
        prompt = `${systemMessage}\n\n${userMessage}`;
      } else {
        console.log("Generating content with unknown prompt type:", typeof prompt);
      }

      let result;
      if (this.isAzure) {
        console.log("Using Azure OpenAI API");
        result = await this.generateContentAzureOpenAI(prompt);
      } else {
        console.log("Using standard OpenAI API");
        result = await this.generateContentOpenAI(prompt);
      }
      console.log("Received result:", result.substring(0, 100) + "...");
      return result;
    } catch (error) {
      console.error("Error in generateContent:", error);
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  // Generate content using Azure OpenAI API
  async generateContentAzureOpenAI(prompt) {
    console.log("Generating with Azure OpenAI:", {
      endpoint: this.endpoint,
      model: this.modelOrDeployment
    });

    if (!this.endpoint || !this.apiKey || !this.apiVersion || !this.modelOrDeployment) {
      throw new Error("Azure OpenAI configuration incomplete");
    }

    const url = `${this.endpoint}/openai/deployments/${this.modelOrDeployment}/chat/completions?api-version=${this.apiVersion}`;
    console.log("Request URL:", url);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a helpful AI assistant." },
            { role: "user", content: prompt }
          ],
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Azure OpenAI API error response:", errorText);
        throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Unexpected API response structure:", data);
        throw new Error("Invalid response format from Azure OpenAI API");
      }
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Azure API call failed:", error);
      throw error;
    }
  }

  // Generate content using standard OpenAI API
  async generateContentOpenAI(prompt) {
    console.log("Generating with OpenAI:", {
      model: this.modelOrDeployment
    });

    if (!this.apiKey || !this.modelOrDeployment) {
      throw new Error("OpenAI configuration incomplete");
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    console.log("Request URL:", url);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelOrDeployment,
          messages: [
            { role: "system", content: "You are a helpful AI assistant." },
            { role: "user", content: prompt }
          ],
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error response:", errorText);
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Unexpected API response structure:", data);
        throw new Error("Invalid response format from OpenAI API");
      }
      return data.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API call failed:", error);
      throw error;
    }
  }

  // Helper method to parse simulation plan
  parseSimulationPlan(responseText) {
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
      if (!jsonMatch || (!jsonMatch[1] && !jsonMatch[2])) {
        throw new Error("Could not find JSON agent plan in the response.");
      }

      const jsonString = jsonMatch[1] || jsonMatch[2];
      const data = JSON.parse(jsonString);

      if (!data || !Array.isArray(data.agents) || data.agents.length === 0) {
        throw new Error("Invalid JSON: 'agents' array not found or empty.");
      }

      // Validate agent data
      data.agents.forEach((agent, index) => {
        if (typeof agent.id !== 'number' || typeof agent.name !== 'string' || typeof agent.role !== 'string') {
          throw new Error(`Agent ${index}: missing/invalid id, name, or role.`);
        }

        agent.tools = (Array.isArray(agent.tools) && agent.tools.every(t => typeof t === 'string')) ? agent.tools : [];
        agent.knowledge = (Array.isArray(agent.knowledge) && agent.knowledge.every(k => typeof k === 'string')) ? agent.knowledge : [];
      });

      // Validate links
      if (!data.links) {
        data.links = [];
      } else if (!Array.isArray(data.links)) {
        throw new Error("Invalid JSON: 'links' is not an array.");
      } else {
        const agentIds = new Set(data.agents.map(a => a.id));
        data.links.forEach((link, index) => {
          if (typeof link.source !== 'number' || typeof link.target !== 'number' || !agentIds.has(link.source) || !agentIds.has(link.target)) {
            throw new Error(`Link ${index}: invalid source/target ID.`);
          }
        });
      }

      return { agents: data.agents, links: data.links };
    } catch (error) {
      console.error("Failed to parse simulation plan:", error);
      throw new Error(`Error parsing simulation plan: ${error.message}`);
    }
  }
}

export default OpenAIService;
