/**
 * Parse the JSON simulation plan from the LLM response
 * @param {string} responseText - Raw LLM response
 * @returns {object | null} Parsed plan or null on error
 */
export function parseSimulationPlan(responseText) {
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
    
    data.agents.forEach((agent, index) => {
      if (typeof agent.id !== 'number' || typeof agent.name !== 'string' || typeof agent.role !== 'string') {
        throw new Error(`Agent ${index}: missing/invalid id, name, or role.`);
      }
      agent.tools = (Array.isArray(agent.tools) && agent.tools.every(t => typeof t === 'string')) ? agent.tools : [];
      agent.knowledge = (Array.isArray(agent.knowledge) && agent.knowledge.every(k => typeof k === 'string')) ? agent.knowledge : [];
    });

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
    return null;
  }
}

/**
 * Maps agent role keywords to emojis
 * @param {string} role - The agent's role string
 * @returns {string} An emoji character
 */
export function getEmojiForRole(role) {
  const lowerRole = role.toLowerCase();
  if (lowerRole.includes('ceo') || lowerRole.includes('leader') || lowerRole.includes('director')) return '👑';
  if (lowerRole.includes('research')) return '🔬';
  if (lowerRole.includes('scientist')) return '🧪';
  if (lowerRole.includes('engineer') || lowerRole.includes('develop') || lowerRole.includes('software') || lowerRole.includes('code')) return '💻';
  if (lowerRole.includes('infra') || lowerRole.includes('ops') || lowerRole.includes('cloud') || lowerRole.includes('server')) return '☁️';
  if (lowerRole.includes('hardware') || lowerRole.includes('compute')) return '💡';
  if (lowerRole.includes('data') || lowerRole.includes('database')) return '💾';
  if (lowerRole.includes('train') || lowerRole.includes('model') || lowerRole.includes('llm') || lowerRole.includes('ai ')) return '🧠';
  if (lowerRole.includes('product') || lowerRole.includes('manager')) return '📊';
  if (lowerRole.includes('market') || lowerRole.includes('sales') || lowerRole.includes('launch')) return '📢';
  if (lowerRole.includes('write') || lowerRole.includes('communicat')) return '✍️';
  if (lowerRole.includes('coord') || lowerRole.includes('plan') || lowerRole.includes('strateg')) return '📋';
  if (lowerRole.includes('evaluat') || lowerRole.includes('test') || lowerRole.includes('qa')) return '✅';
  if (lowerRole.includes('api') || lowerRole.includes('deploy')) return '🚀';
  if (lowerRole.includes('financ') || lowerRole.includes('fund') || lowerRole.includes('budget')) return '💰';
  return '🤖'; // Default
}
