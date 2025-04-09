import React, { useState, useRef, useEffect } from 'react';
import OpenAIService from './services/openaiService';
import * as d3 from 'd3'; // Add this import

function App() {
  // State variables to manage simulation
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationState, setSimulationState] = useState('Idle');
  const [agents, setAgents] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [goalPrompt, setGoalPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [currentMessage, setCurrentMessage] = useState({ agentName: '', message: '' });
  const [showPassword, setShowPassword] = useState(false);

  // D3 visualization state
  const [d3Nodes, setD3Nodes] = useState([]);
  const [d3Links, setD3Links] = useState([]);
  const [d3Simulation, setD3Simulation] = useState(null);
  const [currentSpeakingAgent, setCurrentSpeakingAgent] = useState(null);
  const [agentTooltip, setAgentTooltip] = useState({ visible: false, agentId: null, x: 0, y: 0 });
  const [agentMessageCounts, setAgentMessageCounts] = useState({});

  // Azure OpenAI specific state variables
  const [isAzureOpenAI, setIsAzureOpenAI] = useState(true);
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiVersion, setApiVersion] = useState('2025-01-01-preview');
  const [deploymentName, setDeploymentName] = useState('');

  // Refs for DOM elements
  const agentMapRef = useRef(null);
  const conversationLogRef = useRef(null);
  const d3SvgRef = useRef(null);
  const d3ZoomableGroupRef = useRef(null);

  // Add a ref to store the OpenAI service instance
  const openAIServiceRef = useRef(null);

  // Constants for D3 visualization
  const NODE_RADIUS = 30;

  // Additional state variables for summary functionality
  const [showSummary, setShowSummary] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [goalCompleted, setGoalCompleted] = useState(false);

  // Function to toggle API key visibility
  const toggleApiKeyVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Maps agent role keywords to emojis
  const getEmojiForRole = (role) => {
    const lowerRole = role ? role.toLowerCase() : '';
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
  };

  // Enhanced drag behavior to fix node dragging
  const dragstarted = (event, d) => {
    if (!event.active && d3Simulation) d3Simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    d3.select(event.sourceEvent.target.closest('.node')).raise(); // Raise node to the top during drag
    setAgentTooltip({ visible: false, agentId: null, x: 0, y: 0 });
  };

  const dragged = (event, d) => {
    d.fx = event.x;
    d.fy = event.y;
  };

  const dragended = (event, d) => {
    if (!event.active && d3Simulation) d3Simulation.alphaTarget(0);
  };

  // Show agent tooltip
  const showAgentTooltip = (event, d) => {
    if (agentTooltip.visible && agentTooltip.agentId === d.id) {
      setAgentTooltip({ visible: false, agentId: null, x: 0, y: 0 });
      return;
    }

    const rect = agentMapRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setAgentTooltip({
      visible: true,
      agentId: d.id,
      x: x,
      y: y,
      name: d.name,
      role: d.role
    });
  };

  // Hide agent tooltip
  const hideAgentTooltip = () => {
    setAgentTooltip({ visible: false, agentId: null, x: 0, y: 0 });
  };

  // Setup D3 force-directed graph - Enhanced version
  const setupD3Graph = () => {
    if (!agentMapRef.current || agents.length === 0) {
      console.log("Cannot setup D3 graph - missing container or no agents");
      return;
    }

    const width = agentMapRef.current.clientWidth || 500;
    const height = agentMapRef.current.clientHeight || 400;
    console.log(`Setting up D3 graph with dimensions: ${width}x${height}, ${agents.length} agents, ${d3Links.length} links`);

    // Clear previous SVG
    d3.select(agentMapRef.current).select('svg').remove();

    // Create new SVG with explicit dimensions and styling
    const svg = d3.select(agentMapRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .style('display', 'block')
      .style('cursor', 'grab')
      .style('background-color', 'rgba(255,255,255,0.01)'); // Barely visible background

    // Store the SVG element directly for d3 operations
    d3SvgRef.current = svg.node();

    // Create zoomable container
    const zoomableGroup = svg.append('g');
    d3ZoomableGroupRef.current = zoomableGroup.node(); // Save the DOM node

    // Set up zoom behavior with proper event handling
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        zoomableGroup.attr('transform', event.transform);
        hideAgentTooltip();
      });

    // Apply zoom to SVG
    svg.call(zoom);
    
    // Add style for active dragging
    svg.on('mousedown', () => svg.style('cursor', 'grabbing'))
      .on('mouseup', () => svg.style('cursor', 'grab'));

    // Add a double-click handler to reset zoom
    svg.on('dblclick.zoom', () => {
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(width/2, height/2).scale(0.8)
      );
    });

    // Explicitly center the initial view
    const initialTransform = d3.zoomIdentity.translate(width/2, height/2).scale(0.8);
    svg.call(zoom.transform, initialTransform);

    // Create link group
    const linkGroup = zoomableGroup.append('g').attr('class', 'links');

    // Create node group
    const nodeGroup = zoomableGroup.append('g').attr('class', 'nodes');

    console.log(`Creating ${d3Links.length} links and ${d3Nodes.length} nodes`);

    // Position nodes in a circle initially for better visibility
    const angleStep = (2 * Math.PI) / d3Nodes.length;
    const radius = Math.min(width, height) * 0.35; // 35% of the container size
    
    d3Nodes.forEach((node, i) => {
      const angle = i * angleStep;
      // Set initial positions in a circle
      node.x = width/2 + radius * Math.cos(angle);
      node.y = height/2 + radius * Math.sin(angle);
    });

    // Create links with explicit styling
    const links = linkGroup.selectAll('line')
      .data(d3Links)
      .join('line')
      .attr('class', 'link')
      .attr('x1', d => d.source.x || width/2)
      .attr('y1', d => d.source.y || height/2)
      .attr('x2', d => d.target.x || width/2)
      .attr('y2', d => d.target.y || height/2);

    // Enhanced drag behavior
    const drag = d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged) 
      .on('end', dragended);

    // Create node groups with more explicit styling
    const nodes = nodeGroup.selectAll('g.node')
      .data(d3Nodes, d => d.id)
      .join('g')
      .attr('class', d => `node ${d.id === currentSpeakingAgent ? 'agent-speaking' : ''}`)
      .attr('transform', d => `translate(${d.x},${d.y})`) // Set initial positions
      .call(drag) // Apply drag behavior
      .on('click', showAgentTooltip);

    // Add circles to nodes with explicit styling
    nodes.append('circle')
      .attr('r', NODE_RADIUS)
      .attr('fill', '#6366f1')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    // Add emoji text with adjusted positioning
    nodes.append('text')
      .attr('class', 'node-emoji')
      .attr('dy', '-0.5em')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#1e293b')
      .attr('font-size', '1.6em')
      .text(d => getEmojiForRole(d.role));

    // Add name label background with adjusted positioning
    nodes.append('text')
      .attr('class', 'node-label-bg')
      .attr('dy', '0.8em')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .attr('opacity', 0.8)
      .text(d => d.name);

    // Add name label foreground with adjusted positioning
    nodes.append('text')
      .attr('class', 'node-label')
      .attr('dy', '0.8em')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#334155')
      .attr('font-size', '10px')
      .text(d => d.name);

    // Create force simulation
    const simulation = d3.forceSimulation(d3Nodes)
      .force('link', d3.forceLink(d3Links).id(d => d.id).distance(150).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', () => {
        // Add boundary constraints to keep nodes visible
        d3Nodes.forEach(d => {
          d.x = Math.max(NODE_RADIUS, Math.min(width - NODE_RADIUS, d.x));
          d.y = Math.max(NODE_RADIUS, Math.min(height - NODE_RADIUS, d.y));
        });
        
        links
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        nodes.attr('transform', d => `translate(${d.x},${d.y})`);
      });

    // Run the simulation for a few steps to settle the initial layout
    simulation.tick(50);
    
    console.log("D3 simulation started");
    setD3Simulation(simulation);
  };

  // Set the current speaking agent - improved version
  const setAgentSpeaking = (agentId) => {
    setCurrentSpeakingAgent(agentId);
    
    if (!d3SvgRef.current) return;
    
    try {
      // Reset all nodes first
      const allNodes = d3.select(d3SvgRef.current)
        .select('g')
        .selectAll('g.node');
      
      allNodes.classed('agent-speaking', false);
      
      // Then highlight the speaking agent
      allNodes
        .filter(d => d.id === agentId)
        .classed('agent-speaking', true);
      
      // Update the dashboard
      if (agents.length > 0) {
        // Create a new agent message counts object to trigger re-render
        setAgentMessageCounts({...agentMessageCounts});
      }
    } catch (err) {
      console.error("Error setting speaking agent:", err);
    }
  };
  
  // Animate the link between two agents - improved version
  const animateLink = (sourceAgentId, targetAgentId) => {
    if (!d3SvgRef.current) return;
    
    try {
      // Reset all links to inactive state
      d3.select(d3SvgRef.current)
        .select('g')
        .selectAll('.link')
        .classed('link-active', false);
      
      // Activate the specific link between the two agents
      const activeLink = d3.select(d3SvgRef.current)
        .select('g')
        .selectAll('.link')
        .filter(d => 
          (d.source.id === sourceAgentId && d.target.id === targetAgentId) || 
          (d.source.id === targetAgentId && d.target.id === sourceAgentId)
        );
      
      // Apply active class to show animation
      activeLink.classed('link-active', true);
      
      // Add a temporary "Next..." label to the link for better visibility
      if (!activeLink.empty()) {
        const linkData = activeLink.datum();
        if (linkData?.source?.x != null && linkData?.target?.x != null) {
          const midX = (linkData.source.x + linkData.target.x) / 2;
          const midY = (linkData.source.y + linkData.target.y) / 2;
          
          // Add the text label
          const linkLabel = d3.select(d3SvgRef.current)
            .select('g')
            .append('text')
            .attr('class', 'link-label')
            .attr('x', midX)
            .attr('y', midY)
            .attr('dy', -5)
            .text("Next...");
          
          // Remove the label after animation completes
          setTimeout(() => {
            linkLabel.remove();
          }, 1500);
        }
      }
      
      // Reset the link appearance after delay
      setTimeout(() => {
        activeLink.classed('link-active', false);
      }, 1500);
    } catch (err) {
      console.error("Error animating link:", err);
    }
  };

  // Function to run the next turn in the simulation - updated for better summary handling
  const runNextTurn = async (currentAgentId, agentsList, force = false) => {
    // Skip if simulation is not running and not forced
    if (!simulationRunning && !force) {
      console.log("Simulation not running, skipping turn");
      
      // Auto-restart if conversation has started but stalled
      if (conversationHistory.length > 0 && simulationState !== 'Completed' && simulationState !== 'Error') {
        console.log("Auto-restarting stalled conversation");
        setSimulationRunning(true);
        // Continue with current agent after a brief pause
        setTimeout(() => {
          runNextTurn(currentAgentId, agentsList, true);
        }, 500);
      }
      return;
    }
    
    try {
      // Get the current agent
      const currentAgent = agentsList.find(a => a.id === currentAgentId);
      if (!currentAgent) {
        throw new Error(`Agent with ID ${currentAgentId} not found`);
      }
      
      // Set current speaking agent for visualization - this will update dashboard
      setCurrentSpeakingAgent(currentAgentId);
      setAgentSpeaking(currentAgentId);
      
      console.log(`Agent ${currentAgent.name} (ID: ${currentAgentId}) is speaking`);
      
      // Get the agent's message
      const response = await openAIServiceRef.current.getAgentResponse(
        currentAgent,
        agentsList,
        conversationHistory,
        goalPrompt
      );
      
      // Update UI with the message
      setCurrentMessage({ agentName: currentAgent.name, message: response.message });
      
      // Add message to conversation history
      addLogEntry(currentAgent.name, response.message);
      
      // Check if goal is completed based on the message
      const goalCheckResponse = await openAIServiceRef.current.checkGoalCompletion(
        goalPrompt,
        response.message,  
        conversationHistory 
      );
      
      if (goalCheckResponse.isCompleted) {
        console.log("Goal completed!");
        setGoalCompleted(true);
        setSimulationRunning(false);
        setSimulationState('Completed');
        addLogEntry("System", "Goal has been achieved! Simulation complete.");
        
        // Generate summary automatically and show popup
        setTimeout(() => {
          generateSummary();
          setShowSummary(true);
        }, 1000);
        return;
      }
      
      // Determine next agent to speak
      const nextAgentId = response.nextAgentId || 
        getNextAgentId(currentAgentId, agentsList);
      
      // Animate the link between current and next agent
      animateLink(currentAgentId, nextAgentId);
      
      // Increment turn counter
      setCurrentTurn(prev => prev + 1);
      
      // Check if we've reached a maximum number of turns to prevent endless discussions
      if (currentTurn >= 20) { // Add a reasonable turn limit
        console.log("Maximum turns reached, prompting for goal completion check");
        addLogEntry("System", "This discussion has been lengthy. Checking if we're satisfied with the results...");
        
        // Generate summary and conclude
        setTimeout(() => {
          setSimulationRunning(false);
          setSimulationState('Completed');
          generateSummary();
          setShowSummary(true);
        }, 1000);
        return;
      }
      
      // Schedule the next turn after a delay for readability
      setTimeout(() => {
        // Always force run the next turn to prevent stalling
        runNextTurn(nextAgentId, agentsList, true);
      }, 2000); // 2 second delay between turns
      
    } catch (error) {
      console.error("Error during agent turn:", error);
      addLogEntry("System", `Error: ${error.message}`);
      setSimulationRunning(false);
      setSimulationState('Error');
    }
  };

  // Generate and display summary - improved version
  const generateSummary = async () => {
    if (!openAIServiceRef.current || conversationHistory.length === 0) return;
    
    try {
      setSummaryLoading(true);
      setShowSummary(true);
      
      const summary = await openAIServiceRef.current.generateSimulationSummary(
        goalPrompt,
        conversationHistory
      );
      
      setSummaryContent(summary);
    } catch (error) {
      console.error("Error generating summary:", error);
      setSummaryContent(`Error generating summary: ${error.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Effect to set up D3 graph when agents change
  useEffect(() => {
    console.log(`Agents updated, length: ${agents.length}, D3 nodes: ${d3Nodes.length}, D3 links: ${d3Links.length}`);
    if (agents.length > 0 && d3Nodes.length > 0) {
      console.log("Setting up D3 graph from useEffect");
      setupD3Graph();
    }
  }, [agents, d3Nodes.length, d3Links.length]);

  // Ensure we clean up D3 simulation on unmount
  useEffect(() => {
    return () => {
      if (d3Simulation) {
        d3Simulation.stop();
      }
    };
  }, []);
  
  // Handle window resize 
  useEffect(() => {
    const handleResize = () => {
      if (d3SvgRef.current && agents.length > 0) {
        const width = agentMapRef.current.clientWidth;
        const height = agentMapRef.current.clientHeight;
        if (width > 0 && height > 0) {
          d3.select(d3SvgRef.current)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height]);
          
          if (d3Simulation) {
            d3Simulation
              .force("center", d3.forceCenter(width / 2, height / 2))
              .alpha(0.3)
              .restart();
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [agents.length, d3Simulation]);

  // Function to add a log entry to the conversation history
  const addLogEntry = (agentName, message) => {
    setConversationHistory(prev => [...prev, { agentName, message }]);
    
    // Update message counts for non-system messages
    if (agentName !== "System") {
      const agentId = agents.find(a => a.name === agentName)?.id;
      if (agentId) {
        setAgentMessageCounts(prev => ({
          ...prev,
          [agentId]: (prev[agentId] || 0) + 1
        }));
      }
    }
    
    // Safely scroll to bottom of conversation log
    if (conversationLogRef.current) {
      setTimeout(() => {
        if (conversationLogRef.current) {
          conversationLogRef.current.scrollTop = conversationLogRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  // Helper function to determine the next agent
  const getNextAgentId = (currentAgentId, agentsList) => {
    // Get the index of the current agent
    const currentIndex = agentsList.findIndex(a => a.id === currentAgentId);
    
    // Get the next agent (or wrap around to the first)
    const nextIndex = (currentIndex + 1) % agentsList.length;
    
    return agentsList[nextIndex].id;
  };

  // Start or stop simulation
  const handleSimulation = async () => {
    if (simulationRunning) {
      setSimulationRunning(false);
      setSimulationState('Paused'); // Changed from 'Finished' to 'Paused'
      addLogEntry("System", "Simulation paused by user. Press Start to continue.");
    } else {
      // Check if we're just resuming a paused simulation
      if (simulationState === 'Paused' && agents.length > 0 && conversationHistory.length > 0) {
        // Resume from where we left off
        setSimulationRunning(true);
        setSimulationState('Running');
        addLogEntry("System", "Simulation resumed.");
        
        // Find the last agent that spoke
        const lastMessage = conversationHistory[conversationHistory.length - 1];
        const lastAgentName = lastMessage.agentName;
        const lastAgent = agents.find(a => a.name === lastAgentName);
        
        // Get the next agent in line
        const nextAgentId = lastAgent ? getNextAgentId(lastAgent.id, agents) : agents[0].id;
        
        // Continue with the next agent
        setTimeout(() => {
          runNextTurn(nextAgentId, agents, true);
        }, 500);
        
        return;
      }
      
      // Otherwise start a new simulation
      // Validate required fields
      if (!apiKey.trim()) {
        alert("Please enter API Key.");
        return;
      }

      if (isAzureOpenAI) {
        if (!apiEndpoint.trim()) {
          alert("Please enter API Endpoint.");
          return;
        }
        if (!deploymentName.trim()) {
          alert("Please enter Deployment Name.");
          return;
        }
      } else {
        if (!selectedModel.trim()) {
          alert("Please select a model.");
          return;
        }
      }

      if (!goalPrompt.trim()) {
        alert("Please enter goal prompt.");
        return;
      }

      try {
        // Initialize OpenAI service with the appropriate parameters
        console.log("Initializing OpenAI service with:", {
          isAzure: isAzureOpenAI,
          endpoint: isAzureOpenAI ? apiEndpoint : 'OpenAI API',
          model: isAzureOpenAI ? deploymentName : selectedModel
        });
        
        openAIServiceRef.current = new OpenAIService(
          apiKey,
          isAzureOpenAI,
          isAzureOpenAI ? apiEndpoint : '',
          isAzureOpenAI ? apiVersion : '',
          isAzureOpenAI ? deploymentName : selectedModel
        );

        // Clear previous simulation state
        setConversationHistory([]);
        setCurrentTurn(0);
        setCurrentMessage({ agentName: '', message: '' });
        setCurrentSpeakingAgent(null);
        setAgentMessageCounts({});
        
        // Start planning phase
        setSimulationState('Planning');
        
        // Add log entry AFTER state has been updated
        setTimeout(() => {
          addLogEntry("System", `Asking ${isAzureOpenAI ? 'Azure OpenAI' : 'OpenAI'} to plan agents...`);
        }, 0);
        
        // Generate agent plan using the service
        console.log("Requesting agent plan...");
        const simulationPlan = await openAIServiceRef.current.generateAgentPlan(goalPrompt);
        console.log("Generated simulation plan:", simulationPlan);
        
        if (!simulationPlan || !simulationPlan.agents || simulationPlan.agents.length === 0) {
          throw new Error("Failed to generate a valid agent plan");
        }
        
        // Set up agents and visualization data
        const agentsList = simulationPlan.agents;
        const linksList = simulationPlan.links || [];
        
        // Set simulation state BEFORE starting to ensure it's true during the first turn
        setSimulationRunning(true);
        
        console.log(`Setting up ${agentsList.length} agents and ${linksList.length} links`);
        
        // Set up state variables and UI
        setAgents(agentsList);
        setD3Nodes(agentsList.map(agent => ({ ...agent })));
        setD3Links(linksList);
        
        // Initialize message counts
        const counts = {};
        agentsList.forEach(agent => {
          counts[agent.id] = 0;
        });
        setAgentMessageCounts(counts);
        
        // Log after setting up agents
        addLogEntry("System", `${agentsList.length} agents planned successfully.`);
        setSimulationState('Running');
        
        // Wait a bit to ensure state updates have processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Double-check simulation is still running before starting the first turn
        if (agentsList.length > 0) {
          console.log(`Starting first turn with agent ID: ${agentsList[0].id}, agents count: ${agentsList.length}`);
          // Pass necessary state directly to avoid dependency on React state updates
          runNextTurn(agentsList[0].id, agentsList, true); // Added 'true' flag to force run
        }
      } catch (error) {
        console.error("Error starting simulation:", error);
        addLogEntry("System", `Error: ${error.message}`);
        alert("Failed to start simulation: " + error.message);
        setSimulationRunning(false);
        setSimulationState('Error');
      }
    }
  };
  
  // Effect to scroll to bottom of conversation log when history updates
  useEffect(() => {
    if (conversationLogRef.current) {
      conversationLogRef.current.scrollTop = conversationLogRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  // Effect to show alert when goal is completed
  useEffect(() => {
    if (goalCompleted) {
      alert("Goal completed! A summary will be generated.");
    }
  }, [goalCompleted]);

  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col min-h-screen">
      <header className="mb-4 md:mb-6 text-center flex-shrink-0">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-800">Multi-Agent LLM Simulator</h1>
        <p className="text-slate-600 mt-1 md:mt-2">Visualize agents. Use mouse wheel to zoom, drag background to pan, drag nodes to arrange.</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 flex-grow map-section-height mb-6">
        {/* Dashboard Panel */}
        <aside className="lg:w-1/4 bg-white p-4 rounded-xl shadow-lg border border-slate-200 flex flex-col h-full">
          <h2 className="text-lg font-semibold mb-3 text-slate-700 border-b pb-1.5 flex-shrink-0">Dashboard</h2>
          <div className="space-y-4 overflow-y-auto pr-1 flex-grow text-sm">
            <div>
              <h3 className="font-semibold text-slate-600 mb-1">Goal:</h3>
              <p className="text-slate-500 italic text-xs break-words">
                {goalPrompt || "Not started"}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-600 mb-1">State:</h3>
              <p className="text-slate-500 font-medium">{simulationState}</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-600 mb-1">Progress:</h3>
              <p className="text-slate-500">Turn {currentTurn + 1}</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-600 mb-1">Agent Status:</h3>
              <ul className="space-y-2 text-xs">
                {agents.length > 0 ?
                  agents.map(agent => (
                    <li key={agent.id} className="agent-list-item">
                      <div>
                        <span className={`status-dot ${agent.id === currentSpeakingAgent ? 'status-speaking' : 'status-idle'}`}></span>
                        <span className="font-medium">{agent.name}</span>
                        <span className="agent-role-dash">({agent.role || 'N/A'})</span>
                        <span className="agent-msg-count">[{agentMessageCounts[agent.id] || 0}]</span>
                      </div>
                      <div className="agent-details">
                        {agent.tools?.length > 0 && <><strong>Tools:</strong> {agent.tools.join(', ')}<br /></>}
                        {agent.knowledge?.length > 0 && <><strong>Knowledge:</strong> {agent.knowledge.join(', ')}</>}
                      </div>
                    </li>
                  )) :
                  <li className="text-slate-400">No agents yet...</li>
                }
              </ul>
            </div>
          </div>
        </aside>

        {/* Agent Map */}
        <section className="bg-white rounded-xl shadow-lg border border-slate-200 flex-grow relative h-full" style={{ minHeight: '400px' }}>
          <div ref={agentMapRef} className="absolute inset-0" id="agentMap" style={{ height: '100%', width: '100%' }}>
            <p className="absolute inset-0 flex items-center justify-center text-slate-400 z-[-1]" style={{ display: agents.length > 0 ? 'none' : 'flex' }}>
              Start the simulation to visualize agents.
            </p>
            <div className={`absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-30 ${simulationState === 'Planning' ? '' : 'hidden'}`}>
              <div className="spinner"></div>
              <p className="text-slate-600 mt-2">{isAzureOpenAI ? 'Azure OpenAI' : 'OpenAI'} is planning agents...</p>
            </div>
            {agentTooltip.visible && (
              <div id="agentTooltip" style={{ left: `${agentTooltip.x}px`, top: `${agentTooltip.y}px` }}>
                <div className="font-semibold">{agentTooltip.name}</div>
                <div className="text-xs opacity-80">{agentTooltip.role}</div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-shrink-0">
        {/* Setup Panel */}
        <aside className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 flex flex-col bottom-panel-height">
          <h2 className="text-lg font-semibold mb-3 text-slate-700 border-b pb-1.5 flex-shrink-0">Setup</h2>
          <div className="space-y-3 overflow-y-auto pr-1 flex-grow">
            <div className="flex items-center">
              <input
                id="isAzureOpenAI"
                name="isAzureOpenAI"
                type="checkbox"
                className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                checked={isAzureOpenAI}
                onChange={(e) => setIsAzureOpenAI(e.target.checked)}
              />
              <label htmlFor="isAzureOpenAI" className="ml-2 block text-sm font-medium text-slate-600">
                Use Azure OpenAI
              </label>
            </div>

            {isAzureOpenAI ? (
              <>
                <div>
                  <label htmlFor="apiEndpoint" className="block text-sm font-medium text-slate-600 mb-1">API Endpoint</label>
                  <input
                    type="text"
                    id="apiEndpoint"
                    name="apiEndpoint"
                    placeholder="https://your-resource-name.openai.azure.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="apiVersion" className="block text-sm font-medium text-slate-600 mb-1">API Version</label>
                  <input
                    type="text"
                    id="apiVersion"
                    name="apiVersion"
                    placeholder="2025-01-01-preview"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm"
                    value={apiVersion}
                    onChange={(e) => setApiVersion(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="deploymentName" className="block text-sm font-medium text-slate-600 mb-1">Deployment Name</label>
                  <input
                    type="text"
                    id="deploymentName"
                    name="deploymentName"
                    placeholder="Enter your deployment name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm"
                    value={deploymentName}
                    onChange={(e) => setDeploymentName(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium text-slate-600 mb-1">Azure OpenAI API Key</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="apiKey"
                      name="apiKey"
                      placeholder="Enter your API Key"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-700"
                      onClick={toggleApiKeyVisibility}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Handled client-side. Not stored.</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium text-slate-600 mb-1">OpenAI API Key</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="apiKey"
                      name="apiKey"
                      placeholder="Enter your API Key"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-700"
                      onClick={toggleApiKeyVisibility}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Handled client-side. Not stored.</p>
                </div>

                <div>
                  <label htmlFor="selectedModel" className="block text-sm font-medium text-slate-600 mb-1">Model Name</label>
                  <input
                    type="text"
                    id="selectedModel"
                    name="selectedModel"
                    placeholder="e.g., gpt-4o, gpt-3.5-turbo"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="goalPrompt" className="block text-sm font-medium text-slate-600 mb-1">Goal Prompt</label>
              <textarea
                id="goalPrompt"
                name="goalPrompt"
                rows="3"
                placeholder="Describe the goal for the agents..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out text-sm shadow-sm resize-none"
                value={goalPrompt}
                onChange={(e) => setGoalPrompt(e.target.value)}
              ></textarea>
            </div>

            <button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow hover:shadow-md transition duration-200 ease-in-out flex items-center justify-center gap-2 mt-2 sticky bottom-0"
              onClick={handleSimulation}
            >
              {simulationRunning ? "Stop Simulation" : "Start Simulation"}
            </button>
          </div>
        </aside>

        {/* Conversation Log - Fixed structure */}
        <section className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 flex flex-col bottom-panel-height">
          <h2 className="text-lg font-semibold mb-3 text-slate-700 border-b pb-1.5 flex-shrink-0">Conversation Log</h2>
          <div ref={conversationLogRef} className="space-y-2 text-sm flex-grow overflow-y-auto pr-1">
            {conversationHistory.length > 0 ?
              conversationHistory.map((entry, index) => (
                <div key={index} className="p-2 bg-slate-100 rounded-md border border-slate-200 break-words">
                  <span className="font-semibold text-indigo-700">{entry.agentName}:</span> {entry.message}
                </div>
              )) :
              <p className="text-slate-400">Conversation log will appear here...</p>
            }
          </div>
        </section>

        {/* Current Message - Fixed structure */}
        <aside className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 flex flex-col bottom-panel-height">
          <h2 className="text-lg font-semibold mb-3 text-slate-700 border-b pb-1.5 flex-shrink-0">Current Message</h2>
          <div className="flex-grow space-y-1 overflow-y-auto text-sm pr-1">
            {currentMessage.agentName ? (
              <div className="space-y-1">
                <div className="font-semibold text-indigo-700">{currentMessage.agentName}</div>
                <p className="text-slate-700 break-words">{currentMessage.message}</p>
              </div>
            ) : (
              <p className="text-slate-500">Waiting for agent...</p>
            )}
          </div>
        </aside>
      </div>

      {/* Summary Modal - Fixed structure */}
      {showSummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] overflow-auto p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Simulation Summary</h3>
              <button 
                onClick={() => setShowSummary(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
            
            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <div className="spinner"></div>
                <p className="mt-4 text-slate-500">Generating summary...</p>
              </div>
            ) : (
              <div className="prose prose-slate prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ __html: summaryContent }} />
              </div>
            )}
            
            <div className="mt-6 text-right">
              <button
                onClick={() => setShowSummary(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}

export default App;
