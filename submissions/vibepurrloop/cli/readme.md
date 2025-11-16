# Agent CLI

> An interactive CLI agent that auto-evaluates every 30 seconds and supports real-time chat with Anthropic's Claude API.

## Install

```bash
$ npm install
$ npm run build
```

## Setup

Set your Anthropic API key using one of these methods:

**Option 1: Create a `.env` file (recommended)**
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

**Option 2: Export as environment variable**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Option 3: Pass as command-line argument**
```bash
$ cli --api-key=sk-ant-...
```

The `.env` file is automatically loaded when you run the CLI (no need to `source` it).

## Usage

```bash
$ cli --help

  Usage
    $ cli

  Options
    --api-key  Anthropic API key (or set ANTHROPIC_API_KEY env var)

  Examples
    $ cli
    $ cli --api-key=sk-ant-...
```

## Features

- **Auto-evaluation**: The agent automatically evaluates its state every 30 seconds
- **Real-time chat**: Chat with the agent at any time using natural language
- **Interactive UI**: Clean terminal interface with message history and status indicators
- **Keyboard shortcuts**: 
  - `Enter` - Send message
  - `ESC` or `Ctrl+C` - Exit

## How it works

The agent runs two concurrent processes:
1. **Evaluation loop**: Every 30 seconds, the agent calls Claude API to evaluate its current state and context
2. **Chat interface**: You can type messages at any time, and the agent responds using Claude API with conversation history
