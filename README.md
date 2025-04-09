# Multi Agentic System Simulator

⚛️ **Rebuilt in ReactJS**: A Multi-Agentic System Simulator 🤖 tool that uses Large Language Models (LLMs) to simulate agent interactions, visualize relationships, and facilitate collaborative goal achievement. [Adapted from here](https://x.com/algo_diver/status/1909257761013322112)

## ✨ Features

- 🧠 **Agent Planning**: Dynamically generate agents, roles, and connections using OpenAI or Azure OpenAI APIs.
- 🌐 **Visualization**: Interactive D3.js-based force-directed graph for agent relationships.
- 🔄 **Simulation**: Multi-turn conversations with goal tracking and progress evaluation.
- 📋 **Summary Generation**: Generate concise summaries of agent interactions and outcomes. 

  <img alt="ui" src="ref/sim.png" width="400"/>

## Setup

1. Clone the repository:

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Start the development server:
   ```bash
   yarn start
   ```

## Usage

1. Enter the API key and goal prompt in the setup panel.
2. Type the model name (e.g., GPT-4 or Azure deployment).
3. Start the simulation to visualize agent interactions and progress.

## Technologies

- **Frontend**: React, Tailwind CSS
- **Visualization**: D3.js
- **Backend Integration**: OpenAI / Azure OpenAI APIs

## 📄 License

MIT License.