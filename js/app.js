// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB2wW6aQS6eausCrBikACIKmsD8gn4E0g4",
  authDomain: "rpsls-4e6db.firebaseapp.com",
  databaseURL: "https://rpsls-4e6db-default-rtdb.firebaseio.com",
  projectId: "rpsls-4e6db",
  storageBucket: "rpsls-4e6db.firebasestorage.app",
  messagingSenderId: "665715994571",
  appId: "1:665715994571:web:52d971ca41f55e052f104e",
};

// Game Rules
const GAME_RULES = {
  rock: { beats: ["lizard", "scissors"], actions: ["crushes", "crushes"] },
  paper: { beats: ["rock", "spock"], actions: ["covers", "disproves"] },
  scissors: { beats: ["paper", "lizard"], actions: ["cuts", "decapitates"] },
  lizard: { beats: ["spock", "paper"], actions: ["poisons", "eats"] },
  spock: { beats: ["scissors", "rock"], actions: ["smashes", "vaporizes"] },
};

const CHOICES = [
  { id: "rock", name: "Rock", emoji: "🗿" },
  { id: "paper", name: "Paper", emoji: "📄" },
  { id: "scissors", name: "Scissors", emoji: "✂️" },
  { id: "lizard", name: "Lizard", emoji: "🦎" },
  { id: "spock", name: "Spock", emoji: "🖖" },
];

// Game States - STRICT STATE MACHINE
const GAME_STATES = {
  MENU: "MENU",
  LOCAL_SETUP: "LOCAL_SETUP",
  CREATE_ROOM: "CREATE_ROOM",
  JOIN_ROOM: "JOIN_ROOM",
  WAITING_FOR_PLAYERS: "WAITING_FOR_PLAYERS",
  GAME_READY: "GAME_READY",
  ROUND_IN_PROGRESS: "ROUND_IN_PROGRESS",
  ROUND_COMPLETE: "ROUND_COMPLETE",
  SERIES_COMPLETE: "SERIES_COMPLETE",
};

// Global State
let app = null;
let database = null;
let firebaseAvailable = false;
let currentGameState = GAME_STATES.MENU;
let gameData = null;
let roomRef = null;
let playerId = null;
let gameListeners = [];

// Debug and Logging System
class GameLogger {
  static logs = [];

  static log(event, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, event, data, state: currentGameState };

    console.log(`[${timestamp}] ${event}:`, data);
    this.logs.push(logEntry);

    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }

    // Update debug panel
    this.updateDebugPanel();
  }

  static updateDebugPanel() {
    const debugState = document.getElementById("debug-state");
    const debugRoom = document.getElementById("debug-room");
    const debugPlayers = document.getElementById("debug-players");
    const debugRound = document.getElementById("debug-round");

    if (debugState) debugState.textContent = currentGameState;
    if (debugRoom) debugRoom.textContent = gameData?.roomCode || "None";
    if (debugPlayers)
      debugPlayers.textContent = gameData?.players
        ? Object.keys(gameData.players).length
        : "0";
    if (debugRound)
      debugRound.textContent = gameData
        ? `${gameData.currentRound || 0}/${gameData.maxRounds || 0}`
        : "0/0";
  }

  static getRecentLogs(count = 10) {
    return this.logs.slice(-count);
  }
}

// Connection Manager
class ConnectionManager {
  constructor() {
    this.isOnline = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.heartbeatInterval = null;
  }

  async initialize() {
    GameLogger.log("CONNECTION_INIT", { config: "Checking Firebase config" });

    try {
      // Check if config has placeholder values
      if (firebaseConfig.apiKey === "your-api-key-here") {
        GameLogger.log("FIREBASE_CONFIG_MISSING", {
          reason: "Placeholder values detected",
        });
        this.handleFirebaseUnavailable();
        return false;
      }

      // Initialize Firebase
      app = firebase.initializeApp(firebaseConfig);
      database = firebase.database();

      // Generate unique player ID
      playerId = this.generatePlayerId();
      GameLogger.log("PLAYER_ID_GENERATED", { playerId });

      // Test connection
      await this.testConnection();

      firebaseAvailable = true;
      this.isOnline = true;
      this.setupConnectionMonitoring();
      this.updateConnectionStatus("connected", "Firebase Connected");
      this.enableOnlineFeatures();

      GameLogger.log("FIREBASE_CONNECTED", { playerId });
      return true;
    } catch (error) {
      GameLogger.log("FIREBASE_CONNECTION_FAILED", { error: error.message });
      this.handleFirebaseUnavailable();
      return false;
    }
  }

  async testConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 5000);

      const connectedRef = database.ref("info/connected");
      connectedRef.once(
        "value",
        (snapshot) => {
          clearTimeout(timeout);
          if (snapshot.val() === true) {
            resolve();
          } else {
            reject(new Error("Not connected"));
          }
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }

  setupConnectionMonitoring() {
    const connectedRef = database.ref("info/connected");
    connectedRef.on("value", (snapshot) => {
      if (snapshot.val() === true) {
        this.isOnline = true;
        this.reconnectAttempts = 0;
        this.updateConnectionStatus("connected", "Firebase Connected");
        GameLogger.log("CONNECTION_RESTORED");
      } else {
        this.isOnline = false;
        this.updateConnectionStatus(
          "connecting",
          "Reconnecting to Firebase..."
        );
        GameLogger.log("CONNECTION_LOST");
        this.handleReconnect();
      }
    });
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      GameLogger.log("RECONNECT_ATTEMPT", { attempt: this.reconnectAttempts });

      setTimeout(() => {
        if (!this.isOnline) {
          this.testConnection().catch(() => {
            GameLogger.log("RECONNECT_FAILED", {
              attempt: this.reconnectAttempts,
            });
          });
        }
      }, 2000 * this.reconnectAttempts);
    } else {
      this.updateConnectionStatus("error", "Connection Failed");
      GameLogger.log("RECONNECT_EXHAUSTED");
    }
  }

  handleFirebaseUnavailable() {
    firebaseAvailable = false;
    this.isOnline = false;
    this.updateConnectionStatus("error", "Firebase Not Available");
    this.showFirebaseNotice();
    this.disableOnlineFeatures();
  }

  updateConnectionStatus(status, text) {
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");

    if (statusDot && statusText) {
      statusDot.className = `status-dot ${status}`;
      statusText.textContent = text;
    }
  }

  showFirebaseNotice() {
    const notice = document.getElementById("firebase-notice");
    if (notice) {
      notice.classList.remove("hidden");
    }
  }

  enableOnlineFeatures() {
    const createStatus = document.getElementById("create-status");
    const joinStatus = document.getElementById("join-status");
    const createBtn = document.getElementById("create-room-btn");
    const joinBtn = document.getElementById("join-room-btn");

    if (createStatus) createStatus.textContent = "✓ Real-time multiplayer";
    if (joinStatus) joinStatus.textContent = "✓ Join any room instantly";
    if (createBtn) createBtn.disabled = false;
    if (joinBtn) joinBtn.disabled = false;
  }

  disableOnlineFeatures() {
    const createStatus = document.getElementById("create-status");
    const joinStatus = document.getElementById("join-status");
    const createBtn = document.getElementById("create-room-btn");
    const joinBtn = document.getElementById("join-room-btn");

    if (createStatus) createStatus.textContent = "❌ Requires Firebase setup";
    if (joinStatus) joinStatus.textContent = "❌ Requires Firebase setup";
    if (createBtn) createBtn.disabled = true;
    if (joinBtn) joinBtn.disabled = true;
  }

  generatePlayerId() {
    return (
      "player_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now()
    );
  }
}

// Firebase Manager - Bulletproof Operations
class FirebaseManager {
  static async createRoom(hostName, maxRounds) {
    if (!firebaseAvailable) {
      throw new Error("Firebase not available");
    }

    const roomCode = this.generateRoomCode();
    const hostId = playerId;

    const roomData = {
      roomCode,
      status: "WAITING_FOR_PLAYERS",
      maxRounds: parseInt(maxRounds),
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastActivity: firebase.database.ServerValue.TIMESTAMP,
      host: hostId,
      players: {
        [hostId]: {
          id: hostId,
          name: hostName,
          isHost: true,
          connected: true,
          ready: false,
        },
      },
      game: {
        currentRound: 1,
        scores: { [hostId]: 0 },
        roundWins: { [hostId]: 0 },
        currentChoices: {},
        lastResult: null,
        seriesWinner: null,
      },
    };

    try {
      await database.ref(`rooms/${roomCode}`).set(roomData);
      GameLogger.log("ROOM_CREATED", { roomCode, hostId, maxRounds });
      return { roomCode, playerId: hostId };
    } catch (error) {
      GameLogger.log("ROOM_CREATE_FAILED", { error: error.message });
      throw error;
    }
  }

  static async joinRoom(roomCode, playerName) {
    if (!firebaseAvailable) {
      throw new Error("Firebase not available");
    }

    GameLogger.log("JOIN_ROOM_ATTEMPT", { roomCode, playerName });

    try {
      const result = await database
        .ref(`rooms/${roomCode}`)
        .transaction((room) => {
          if (!room) {
            GameLogger.log("JOIN_ROOM_NOT_FOUND", { roomCode });
            return null; // Room doesn't exist
          }

          if (room.status !== "WAITING_FOR_PLAYERS") {
            GameLogger.log("JOIN_ROOM_WRONG_STATUS", {
              roomCode,
              status: room.status,
            });
            return; // Game already in progress
          }

          if (Object.keys(room.players).length >= 2) {
            GameLogger.log("JOIN_ROOM_FULL", { roomCode });
            return; // Room full
          }

          const guestId = playerId;
          room.players[guestId] = {
            id: guestId,
            name: playerName,
            isHost: false,
            connected: true,
            ready: true,
          };

          room.game.scores[guestId] = 0;
          room.game.roundWins[guestId] = 0;
          room.status = "GAME_READY";
          room.lastActivity = firebase.database.ServerValue.TIMESTAMP;

          GameLogger.log("JOIN_ROOM_SUCCESS", { roomCode, guestId });
          return room;
        });

      if (result.committed && result.snapshot.val()) {
        return { success: true, playerId };
      } else {
        throw new Error("Failed to join room - room may be full or not exist");
      }
    } catch (error) {
      GameLogger.log("JOIN_ROOM_FAILED", { roomCode, error: error.message });
      throw error;
    }
  }

  static async submitChoice(roomCode, playerId, choice) {
    if (!firebaseAvailable) {
      throw new Error("Firebase not available");
    }

    GameLogger.log("SUBMIT_CHOICE", { roomCode, playerId, choice });

    try {
      // Atomic choice submission
      const updates = {};
      updates[`game/currentChoices/${playerId}`] = choice;
      updates[`players/${playerId}/lastAction`] =
        firebase.database.ServerValue.TIMESTAMP;
      updates["lastActivity"] = firebase.database.ServerValue.TIMESTAMP;

      await database.ref(`rooms/${roomCode}`).update(updates);

      // Check if both players have chosen
      const snapshot = await database
        .ref(`rooms/${roomCode}/game/currentChoices`)
        .once("value");
      const choices = snapshot.val() || {};

      if (Object.keys(choices).length === 2) {
        const playerIds = Object.keys(choices);
        await this.processRound(roomCode, playerIds, choices);
      }
    } catch (error) {
      GameLogger.log("SUBMIT_CHOICE_FAILED", {
        roomCode,
        error: error.message,
      });
      throw error;
    }
  }

  static async processRound(roomCode, playerIds, choices) {
    GameLogger.log("PROCESS_ROUND", { roomCode, choices });

    try {
      const player1Id = playerIds[0];
      const player2Id = playerIds[1];
      const result = this.calculateWinner(
        choices[player1Id],
        choices[player2Id]
      );

      // Update round wins (NOT game scores yet)
      const updates = {};
      if (result.winner !== "tie") {
        const winnerId = result.winner === 1 ? player1Id : player2Id;
        updates[`game/roundWins/${winnerId}`] =
          firebase.database.ServerValue.increment(1);
      }

      // Set round result
      updates["game/lastResult"] = {
        player1Choice: choices[player1Id],
        player2Choice: choices[player2Id],
        winner: result.winner,
        explanation: result.explanation,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
      };
      updates["status"] = "ROUND_COMPLETE";
      updates["lastActivity"] = firebase.database.ServerValue.TIMESTAMP;

      await database.ref(`rooms/${roomCode}`).update(updates);

      // Check if series is complete after delay
      setTimeout(() => this.checkSeriesComplete(roomCode), 3000);
    } catch (error) {
      GameLogger.log("PROCESS_ROUND_FAILED", {
        roomCode,
        error: error.message,
      });
      throw error;
    }
  }

  static async checkSeriesComplete(roomCode) {
    GameLogger.log("CHECK_SERIES_COMPLETE", { roomCode });

    try {
      const snapshot = await database.ref(`rooms/${roomCode}`).once("value");
      const room = snapshot.val();

      if (!room) {
        GameLogger.log("SERIES_CHECK_ROOM_NOT_FOUND", { roomCode });
        return;
      }

      const roundWins = room.game.roundWins;
      const maxRounds = room.maxRounds;
      const requiredWins = Math.ceil(maxRounds / 2);

      const winner = Object.keys(roundWins).find(
        (id) => roundWins[id] >= requiredWins
      );

      if (winner) {
        // Series complete
        await database.ref(`rooms/${roomCode}`).update({
          status: "SERIES_COMPLETE",
          "game/seriesWinner": winner,
          "game/finalScores": roundWins,
          "game/completedAt": firebase.database.ServerValue.TIMESTAMP,
          lastActivity: firebase.database.ServerValue.TIMESTAMP,
        });

        GameLogger.log("SERIES_COMPLETE", {
          roomCode,
          winner,
          finalScores: roundWins,
        });
      } else {
        // Continue to next round
        await database.ref(`rooms/${roomCode}`).update({
          status: "ROUND_IN_PROGRESS",
          "game/currentRound": firebase.database.ServerValue.increment(1),
          "game/currentChoices": {},
          "game/lastResult": null,
          lastActivity: firebase.database.ServerValue.TIMESTAMP,
        });

        GameLogger.log("NEXT_ROUND_STARTED", {
          roomCode,
          currentRound: room.game.currentRound + 1,
        });
      }
    } catch (error) {
      GameLogger.log("SERIES_CHECK_FAILED", { roomCode, error: error.message });
    }
  }

  static calculateWinner(choice1, choice2) {
    if (choice1 === choice2) {
      return { winner: "tie", explanation: "It's a tie!" };
    }

    const choice1Rules = GAME_RULES[choice1];
    const choice1Data = CHOICES.find((c) => c.id === choice1);
    const choice2Data = CHOICES.find((c) => c.id === choice2);

    if (choice1Rules.beats.includes(choice2)) {
      const actionIndex = choice1Rules.beats.indexOf(choice2);
      const action = choice1Rules.actions[actionIndex];
      return {
        winner: 1,
        explanation: `${choice1Data.name} ${action} ${choice2Data.name}`,
      };
    } else {
      const choice2Rules = GAME_RULES[choice2];
      const actionIndex = choice2Rules.beats.indexOf(choice1);
      const action = choice2Rules.actions[actionIndex];
      return {
        winner: 2,
        explanation: `${choice2Data.name} ${action} ${choice1Data.name}`,
      };
    }
  }

  static setupRoomListener(roomCode) {
    if (!firebaseAvailable || !database) {
      return;
    }

    GameLogger.log("SETUP_ROOM_LISTENER", { roomCode });

    const roomRef = database.ref(`rooms/${roomCode}`);

    const listener = roomRef.on("value", (snapshot) => {
      const roomData = snapshot.val();
      if (roomData) {
        GameLogger.log("ROOM_UPDATE_RECEIVED", { status: roomData.status });
        gameData = roomData;
        GameStateManager.handleRoomUpdate(roomData);
      } else {
        GameLogger.log("ROOM_DELETED", { roomCode });
        GameStateManager.handleRoomDeleted();
      }
    });

    gameListeners.push({ ref: roomRef, listener });
  }

  static async leaveRoom(roomCode) {
    if (!firebaseAvailable || !roomCode) {
      return;
    }

    GameLogger.log("LEAVE_ROOM", { roomCode, playerId });

    try {
      // Mark player as disconnected
      await database
        .ref(`rooms/${roomCode}/players/${playerId}/connected`)
        .set(false);

      // Clean up listeners
      gameListeners.forEach(({ ref, listener }) => {
        if (ref && typeof ref.off === "function") {
          ref.off("value", listener);
        }
      });
      gameListeners = [];
    } catch (error) {
      GameLogger.log("LEAVE_ROOM_FAILED", { roomCode, error: error.message });
    }
  }

  static generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

// Game State Manager - Bulletproof State Machine
class GameStateManager {
  static changeState(newState, data = {}) {
    const oldState = currentGameState;
    currentGameState = newState;

    GameLogger.log("STATE_CHANGE", { from: oldState, to: newState, data });

    this.updateUI();
    this.handleStateEntry(newState, data);
  }

  static updateUI() {
    // Hide all sections
    document.querySelectorAll(".section").forEach((section) => {
      section.classList.remove("active");
    });

    // Show appropriate section based on state
    let sectionId;
    switch (currentGameState) {
      case GAME_STATES.MENU:
        sectionId = "menu-section";
        break;
      case GAME_STATES.LOCAL_SETUP:
        sectionId = "local-setup-section";
        break;
      case GAME_STATES.CREATE_ROOM:
        sectionId = "create-room-section";
        break;
      case GAME_STATES.JOIN_ROOM:
        sectionId = "join-room-section";
        break;
      case GAME_STATES.WAITING_FOR_PLAYERS:
        sectionId = "create-room-section"; // Show room display
        break;
      case GAME_STATES.GAME_READY:
      case GAME_STATES.ROUND_IN_PROGRESS:
      case GAME_STATES.ROUND_COMPLETE:
        sectionId = "game-section";
        break;
      case GAME_STATES.SERIES_COMPLETE:
        sectionId = "game-over-section";
        break;
    }

    if (sectionId) {
      const section = document.getElementById(sectionId);
      if (section) {
        section.classList.add("active");
      }
    }
  }

  static handleStateEntry(state, data) {
    switch (state) {
      case GAME_STATES.WAITING_FOR_PLAYERS:
        this.showRoomDisplay(data);
        break;
      case GAME_STATES.GAME_READY:
        this.startGame();
        break;
      case GAME_STATES.ROUND_IN_PROGRESS:
        this.startRound();
        break;
      case GAME_STATES.ROUND_COMPLETE:
        this.showRoundResult();
        break;
      case GAME_STATES.SERIES_COMPLETE:
        this.showGameOver();
        break;
    }
  }

  static handleRoomUpdate(roomData) {
    gameData = roomData;

    switch (roomData.status) {
      case "WAITING_FOR_PLAYERS":
        if (currentGameState !== GAME_STATES.WAITING_FOR_PLAYERS) {
          this.changeState(GAME_STATES.WAITING_FOR_PLAYERS, roomData);
        } else {
          this.updateRoomDisplay(roomData);
        }
        break;
      case "GAME_READY":
        this.changeState(GAME_STATES.GAME_READY, roomData);
        break;
      case "ROUND_IN_PROGRESS":
        this.changeState(GAME_STATES.ROUND_IN_PROGRESS, roomData);
        break;
      case "ROUND_COMPLETE":
        this.changeState(GAME_STATES.ROUND_COMPLETE, roomData);
        break;
      case "SERIES_COMPLETE":
        this.changeState(GAME_STATES.SERIES_COMPLETE, roomData);
        break;
    }
  }

  static handleRoomDeleted() {
    alert("The room has been closed by the host.");
    this.changeState(GAME_STATES.MENU);
  }

  static showRoomDisplay(roomData) {
    const roomDisplay = document.getElementById("room-display");
    const roomCodeElement = document.getElementById("room-code");
    const hostNameElement = document.getElementById("host-display-name");
    const guestSlot = document.getElementById("guest-slot");

    if (roomDisplay) roomDisplay.classList.remove("hidden");
    if (roomCodeElement) roomCodeElement.textContent = roomData.roomCode;
    if (hostNameElement && roomData.players) {
      const host = Object.values(roomData.players).find((p) => p.isHost);
      if (host) hostNameElement.textContent = host.name;
    }

    this.updateRoomDisplay(roomData);
  }

  static updateRoomDisplay(roomData) {
    const guestSlot = document.getElementById("guest-slot");
    if (!guestSlot || !roomData.players) return;

    const players = Object.values(roomData.players);
    const guest = players.find((p) => !p.isHost);

    if (guest) {
      guestSlot.innerHTML = `
        <span class="player-icon">👤</span>
        <span class="player-name">${guest.name}</span>
        <span class="status-badge ready">Ready</span>
      `;
    }
  }

  static startGame() {
    if (!gameData) return;

    GameLogger.log("GAME_STARTED", { roomCode: gameData.roomCode });

    // Update game UI
    const gameModeDisplay = document.getElementById("game-mode-display");
    const player1Name = document.getElementById("player1-name");
    const player2Name = document.getElementById("player2-name");
    const roundInfo = document.getElementById("round-info");

    const players = Object.values(gameData.players);
    const myPlayer = players.find((p) => p.id === playerId);
    const opponent = players.find((p) => p.id !== playerId);

    if (gameModeDisplay) gameModeDisplay.textContent = "Online Multiplayer";
    if (player1Name) player1Name.textContent = myPlayer ? myPlayer.name : "You";
    if (player2Name)
      player2Name.textContent = opponent ? opponent.name : "Opponent";
    if (roundInfo)
      roundInfo.textContent = `Round ${gameData.game.currentRound} of ${gameData.maxRounds}`;

    this.updateScores();
    this.changeState(GAME_STATES.ROUND_IN_PROGRESS);
  }

  static startRound() {
    GameLogger.log("ROUND_STARTED", { round: gameData?.game?.currentRound });

    // Reset round UI
    const roundMessage = document.getElementById("round-message");
    const roundExplanation = document.getElementById("round-explanation");
    const player1ChoiceIcon = document.getElementById("player1-choice-icon");
    const player2ChoiceIcon = document.getElementById("player2-choice-icon");
    const player1ChoiceName = document.getElementById("player1-choice-name");
    const player2ChoiceName = document.getElementById("player2-choice-name");
    const choiceGrid = document.getElementById("choice-grid");
    const waitingState = document.getElementById("waiting-state");
    const roundActions = document.getElementById("round-actions");

    if (roundMessage) roundMessage.textContent = "Make your choice!";
    if (roundExplanation) roundExplanation.textContent = "";
    if (player1ChoiceIcon) player1ChoiceIcon.textContent = "❓";
    if (player2ChoiceIcon) player2ChoiceIcon.textContent = "❓";
    if (player1ChoiceName) player1ChoiceName.textContent = "Your Choice";
    if (player2ChoiceName) player2ChoiceName.textContent = "Opponent Choice";
    if (choiceGrid) choiceGrid.style.display = "grid";
    if (waitingState) waitingState.classList.add("hidden");
    if (roundActions) roundActions.classList.add("hidden");

    // Enable choice buttons
    document.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove("selected");
    });

    this.updateRoundInfo();
  }

  static showRoundResult() {
    if (!gameData?.game?.lastResult) return;

    const result = gameData.game.lastResult;
    GameLogger.log("ROUND_RESULT", result);

    // Update UI with choices and result
    const player1ChoiceIcon = document.getElementById("player1-choice-icon");
    const player2ChoiceIcon = document.getElementById("player2-choice-icon");
    const player1ChoiceName = document.getElementById("player1-choice-name");
    const player2ChoiceName = document.getElementById("player2-choice-name");
    const roundMessage = document.getElementById("round-message");
    const roundExplanation = document.getElementById("round-explanation");

    const choice1Data = CHOICES.find((c) => c.id === result.player1Choice);
    const choice2Data = CHOICES.find((c) => c.id === result.player2Choice);

    if (player1ChoiceIcon && choice1Data) {
      player1ChoiceIcon.textContent = choice1Data.emoji;
      player1ChoiceIcon.classList.remove("winner", "loser");
      if (result.winner === 1) player1ChoiceIcon.classList.add("winner");
      else if (result.winner === 2) player1ChoiceIcon.classList.add("loser");
    }

    if (player2ChoiceIcon && choice2Data) {
      player2ChoiceIcon.textContent = choice2Data.emoji;
      player2ChoiceIcon.classList.remove("winner", "loser");
      if (result.winner === 2) player2ChoiceIcon.classList.add("winner");
      else if (result.winner === 1) player2ChoiceIcon.classList.add("loser");
    }

    if (player1ChoiceName && choice1Data)
      player1ChoiceName.textContent = choice1Data.name;
    if (player2ChoiceName && choice2Data)
      player2ChoiceName.textContent = choice2Data.name;

    if (roundMessage) {
      if (result.winner === 1) {
        roundMessage.textContent = "You Win This Round!";
        roundMessage.style.color = "var(--color-success)";
      } else if (result.winner === 2) {
        roundMessage.textContent = "Opponent Wins This Round!";
        roundMessage.style.color = "var(--color-error)";
      } else {
        roundMessage.textContent = "Round Tied!";
        roundMessage.style.color = "var(--color-warning)";
      }
    }

    if (roundExplanation) roundExplanation.textContent = result.explanation;

    this.updateScores();

    // Show next round button if not series complete
    const roundActions = document.getElementById("round-actions");
    if (roundActions && gameData.status !== "SERIES_COMPLETE") {
      roundActions.classList.remove("hidden");
    }
  }

  static showGameOver() {
    if (!gameData) return;

    GameLogger.log("GAME_OVER", { winner: gameData.game.seriesWinner });

    const gameOverTitle = document.getElementById("game-over-title");
    const finalScores = document.getElementById("final-scores");
    const gameSummary = document.getElementById("game-summary");

    const players = Object.values(gameData.players);
    const myPlayer = players.find((p) => p.id === playerId);
    const opponent = players.find((p) => p.id !== playerId);
    const finalRoundWins = gameData.game.finalScores || gameData.game.roundWins;

    const myScore = finalRoundWins[playerId] || 0;
    const opponentScore = finalRoundWins[opponent?.id] || 0;

    if (gameOverTitle) {
      if (gameData.game.seriesWinner === playerId) {
        gameOverTitle.textContent = "🎉 You Win!";
        gameOverTitle.style.color = "var(--color-success)";
      } else if (gameData.game.seriesWinner === opponent?.id) {
        gameOverTitle.textContent = "😔 You Lose!";
        gameOverTitle.style.color = "var(--color-error)";
      } else {
        gameOverTitle.textContent = "🤝 Tie Game!";
        gameOverTitle.style.color = "var(--color-warning)";
      }
    }

    if (finalScores) {
      finalScores.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span>${myPlayer?.name || "You"}: <strong>${myScore}</strong></span>
          <span>${
            opponent?.name || "Opponent"
          }: <strong>${opponentScore}</strong></span>
        </div>
      `;
    }

    if (gameSummary) {
      const totalRounds = gameData.game.currentRound - 1;
      gameSummary.textContent = `Game completed in ${totalRounds} rounds. Thanks for playing!`;
    }
  }

  static updateScores() {
    if (!gameData) return;

    const player1Score = document.getElementById("player1-score");
    const player2Score = document.getElementById("player2-score");
    const roundInfo = document.getElementById("round-info");

    const players = Object.values(gameData.players);
    const myPlayer = players.find((p) => p.id === playerId);
    const opponent = players.find((p) => p.id !== playerId);

    const myScore = gameData.game.roundWins[playerId] || 0;
    const opponentScore = gameData.game.roundWins[opponent?.id] || 0;

    if (player1Score) player1Score.textContent = myScore.toString();
    if (player2Score) player2Score.textContent = opponentScore.toString();
    if (roundInfo)
      roundInfo.textContent = `Round ${gameData.game.currentRound} of ${gameData.maxRounds}`;
  }

  static updateRoundInfo() {
    if (!gameData) return;

    const roundInfo = document.getElementById("round-info");
    if (roundInfo) {
      roundInfo.textContent = `Round ${gameData.game.currentRound} of ${gameData.maxRounds}`;
    }
  }
}

// Local AI Player
class AIPlayer {
  constructor(difficulty = "adaptive") {
    this.difficulty = difficulty;
    this.playerHistory = [];
    this.patternMemory = new Map();
  }

  makeChoice() {
    switch (this.difficulty) {
      case "random":
        return this.getRandomChoice();
      case "adaptive":
        return this.getAdaptiveChoice();
      case "expert":
        return this.getExpertChoice();
      default:
        return this.getRandomChoice();
    }
  }

  recordPlayerChoice(choice) {
    this.playerHistory.push(choice);
    if (this.playerHistory.length > 20) {
      this.playerHistory = this.playerHistory.slice(-20);
    }
  }

  getRandomChoice() {
    const choices = ["rock", "paper", "scissors", "lizard", "spock"];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  getAdaptiveChoice() {
    if (this.playerHistory.length < 3) {
      return this.getRandomChoice();
    }

    const recent = this.playerHistory.slice(-3);
    const predicted = this.predictNextChoice(recent);

    if (predicted && Math.random() < 0.7) {
      return this.getCounterChoice(predicted);
    }

    return this.getRandomChoice();
  }

  getExpertChoice() {
    if (this.playerHistory.length < 2) {
      return this.getRandomChoice();
    }

    // Advanced pattern recognition
    const patterns = this.findPatterns();
    if (patterns.length > 0 && Math.random() < 0.8) {
      const bestPattern = patterns[0];
      return this.getCounterChoice(bestPattern.nextChoice);
    }

    // Fallback to adaptive
    return this.getAdaptiveChoice();
  }

  predictNextChoice(recent) {
    const counts = {};
    recent.forEach((choice) => {
      counts[choice] = (counts[choice] || 0) + 1;
    });

    return Object.keys(counts).reduce((a, b) =>
      counts[a] > counts[b] ? a : b
    );
  }

  findPatterns() {
    const patterns = [];
    const history = this.playerHistory;

    for (let len = 2; len <= Math.min(4, history.length - 1); len++) {
      for (let i = 0; i <= history.length - len - 1; i++) {
        const pattern = history.slice(i, i + len);
        const nextChoice = history[i + len];

        const key = pattern.join(",");
        if (!this.patternMemory.has(key)) {
          this.patternMemory.set(key, []);
        }
        this.patternMemory.get(key).push(nextChoice);
      }
    }

    // Find current pattern matches
    for (let len = Math.min(4, history.length); len >= 2; len--) {
      const currentPattern = history.slice(-len).join(",");
      if (this.patternMemory.has(currentPattern)) {
        const occurrences = this.patternMemory.get(currentPattern);
        const prediction = this.getMostCommon(occurrences);
        patterns.push({
          pattern: currentPattern,
          nextChoice: prediction,
          confidence: len,
        });
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  getMostCommon(arr) {
    const counts = {};
    arr.forEach((item) => (counts[item] = (counts[item] || 0) + 1));
    return Object.keys(counts).reduce((a, b) =>
      counts[a] > counts[b] ? a : b
    );
  }

  getCounterChoice(choice) {
    const counters = [];

    // Find all choices that beat the predicted choice
    Object.keys(GAME_RULES).forEach((key) => {
      if (GAME_RULES[key].beats.includes(choice)) {
        counters.push(key);
      }
    });

    return counters.length > 0
      ? counters[Math.floor(Math.random() * counters.length)]
      : this.getRandomChoice();
  }
}

// Local Game Manager - FIXED VERSION
class LocalGameManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.playerName = "Player";
    this.maxRounds = 3;
    this.currentRound = 1;
    this.playerScore = 0;
    this.aiScore = 0;
    this.ai = null;
    this.playerChoice = null;
    this.aiChoice = null;
    this.gameActive = false;
    this.isWaitingForAI = false;
  }

  startGame(playerName, maxRounds, difficulty) {
    this.reset();
    this.playerName = playerName;
    this.maxRounds = parseInt(maxRounds);
    this.ai = new AIPlayer(difficulty);
    this.gameActive = true;

    GameLogger.log("LOCAL_GAME_STARTED", { playerName, maxRounds, difficulty });

    // Update UI
    const gameModeDisplay = document.getElementById("game-mode-display");
    const player1Name = document.getElementById("player1-name");
    const player2Name = document.getElementById("player2-name");

    if (gameModeDisplay)
      gameModeDisplay.textContent = `Local Game (${difficulty})`;
    if (player1Name) player1Name.textContent = playerName;
    if (player2Name) player2Name.textContent = "AI";

    // Start in round in progress state
    GameStateManager.changeState(GAME_STATES.ROUND_IN_PROGRESS);
    this.startRound();
  }

  startRound() {
    if (!this.gameActive) return;

    this.playerChoice = null;
    this.aiChoice = null;
    this.isWaitingForAI = false;

    GameLogger.log("LOCAL_ROUND_STARTED", { round: this.currentRound });

    // Update UI
    const roundMessage = document.getElementById("round-message");
    const roundExplanation = document.getElementById("round-explanation");
    const roundInfo = document.getElementById("round-info");
    const player1ChoiceIcon = document.getElementById("player1-choice-icon");
    const player2ChoiceIcon = document.getElementById("player2-choice-icon");
    const player1ChoiceName = document.getElementById("player1-choice-name");
    const player2ChoiceName = document.getElementById("player2-choice-name");
    const choiceGrid = document.getElementById("choice-grid");
    const waitingState = document.getElementById("waiting-state");
    const roundActions = document.getElementById("round-actions");

    if (roundMessage) {
      roundMessage.textContent = "Make your choice!";
      roundMessage.style.color = "var(--color-text)";
    }
    if (roundExplanation) roundExplanation.textContent = "";
    if (roundInfo)
      roundInfo.textContent = `Round ${this.currentRound} of ${this.maxRounds}`;
    if (player1ChoiceIcon) {
      player1ChoiceIcon.textContent = "❓";
      player1ChoiceIcon.classList.remove("winner", "loser");
    }
    if (player2ChoiceIcon) {
      player2ChoiceIcon.textContent = "❓";
      player2ChoiceIcon.classList.remove("winner", "loser");
    }
    if (player1ChoiceName) player1ChoiceName.textContent = "Your Choice";
    if (player2ChoiceName) player2ChoiceName.textContent = "AI Choice";
    if (choiceGrid) choiceGrid.style.display = "grid";
    if (waitingState) waitingState.classList.add("hidden");
    if (roundActions) roundActions.classList.add("hidden");

    // Enable choice buttons
    document.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove("selected");
    });

    this.updateScores();
  }

  makeChoice(choice) {
    if (!this.gameActive || this.playerChoice || this.isWaitingForAI) {
      GameLogger.log("LOCAL_CHOICE_REJECTED", {
        gameActive: this.gameActive,
        playerChoice: this.playerChoice,
        isWaitingForAI: this.isWaitingForAI,
      });
      return;
    }

    this.playerChoice = choice;
    this.isWaitingForAI = true;
    this.ai.recordPlayerChoice(choice);

    GameLogger.log("LOCAL_PLAYER_CHOICE", { choice });

    // Update UI immediately with player's choice
    const choiceData = CHOICES.find((c) => c.id === choice);
    const player1ChoiceIcon = document.getElementById("player1-choice-icon");
    const player1ChoiceName = document.getElementById("player1-choice-name");
    const choiceGrid = document.getElementById("choice-grid");
    const waitingState = document.getElementById("waiting-state");
    const waitingMessage = document.getElementById("waiting-message");

    if (player1ChoiceIcon && choiceData)
      player1ChoiceIcon.textContent = choiceData.emoji;
    if (player1ChoiceName && choiceData)
      player1ChoiceName.textContent = choiceData.name;
    if (choiceGrid) choiceGrid.style.display = "none";
    if (waitingState) waitingState.classList.remove("hidden");
    if (waitingMessage) waitingMessage.textContent = "AI is thinking...";

    // Disable and highlight choice buttons
    document.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.choice === choice) {
        btn.classList.add("selected");
      }
    });

    // AI makes choice after realistic delay
    setTimeout(() => {
      if (this.gameActive && this.isWaitingForAI) {
        this.aiChoice = this.ai.makeChoice();
        GameLogger.log("LOCAL_AI_CHOICE", { choice: this.aiChoice });
        this.resolveRound();
      }
    }, 800 + Math.random() * 1200); // 0.8-2.0 seconds
  }

  resolveRound() {
    if (!this.playerChoice || !this.aiChoice || !this.gameActive) {
      GameLogger.log("LOCAL_RESOLVE_FAILED", {
        playerChoice: this.playerChoice,
        aiChoice: this.aiChoice,
        gameActive: this.gameActive,
      });
      return;
    }

    this.isWaitingForAI = false;

    const result = FirebaseManager.calculateWinner(
      this.playerChoice,
      this.aiChoice
    );

    GameLogger.log("LOCAL_ROUND_RESOLVED", {
      playerChoice: this.playerChoice,
      aiChoice: this.aiChoice,
      result,
    });

    // Update scores
    if (result.winner === 1) {
      this.playerScore++;
    } else if (result.winner === 2) {
      this.aiScore++;
    }

    // Update UI with AI choice and results
    const aiChoiceData = CHOICES.find((c) => c.id === this.aiChoice);
    const player2ChoiceIcon = document.getElementById("player2-choice-icon");
    const player2ChoiceName = document.getElementById("player2-choice-name");
    const roundMessage = document.getElementById("round-message");
    const roundExplanation = document.getElementById("round-explanation");
    const waitingState = document.getElementById("waiting-state");
    const player1ChoiceIcon = document.getElementById("player1-choice-icon");

    // Hide waiting state
    if (waitingState) waitingState.classList.add("hidden");

    // Show AI choice
    if (player2ChoiceIcon && aiChoiceData) {
      player2ChoiceIcon.textContent = aiChoiceData.emoji;
      player2ChoiceIcon.classList.remove("winner", "loser");
      if (result.winner === 2) player2ChoiceIcon.classList.add("winner");
      else if (result.winner === 1) player2ChoiceIcon.classList.add("loser");
    }
    if (player2ChoiceName && aiChoiceData)
      player2ChoiceName.textContent = aiChoiceData.name;

    // Update player choice icon status
    if (player1ChoiceIcon) {
      player1ChoiceIcon.classList.remove("winner", "loser");
      if (result.winner === 1) player1ChoiceIcon.classList.add("winner");
      else if (result.winner === 2) player1ChoiceIcon.classList.add("loser");
    }

    // Show result message
    if (roundMessage) {
      if (result.winner === 1) {
        roundMessage.textContent = "You Win This Round!";
        roundMessage.style.color = "var(--color-success)";
      } else if (result.winner === 2) {
        roundMessage.textContent = "AI Wins This Round!";
        roundMessage.style.color = "var(--color-error)";
      } else {
        roundMessage.textContent = "Round Tied!";
        roundMessage.style.color = "var(--color-warning)";
      }
    }

    if (roundExplanation) roundExplanation.textContent = result.explanation;

    this.updateScores();

    // Change to round complete state
    GameStateManager.changeState(GAME_STATES.ROUND_COMPLETE);

    // Check if game is over
    const requiredWins = Math.ceil(this.maxRounds / 2);
    if (this.playerScore >= requiredWins || this.aiScore >= requiredWins) {
      setTimeout(() => this.endGame(), 2000);
    } else if (this.currentRound >= this.maxRounds) {
      // Max rounds reached, determine winner by score
      setTimeout(() => this.endGame(), 2000);
    } else {
      // Show next round button
      setTimeout(() => {
        const roundActions = document.getElementById("round-actions");
        if (roundActions) roundActions.classList.remove("hidden");
      }, 1500);
    }
  }

  nextRound() {
    this.currentRound++;
    GameStateManager.changeState(GAME_STATES.ROUND_IN_PROGRESS);
    this.startRound();
  }

  endGame() {
    this.gameActive = false;

    GameLogger.log("LOCAL_GAME_ENDED", {
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      rounds: this.currentRound - 1,
    });

    // Update game over UI
    const gameOverTitle = document.getElementById("game-over-title");
    const finalScores = document.getElementById("final-scores");
    const gameSummary = document.getElementById("game-summary");

    if (gameOverTitle) {
      if (this.playerScore > this.aiScore) {
        gameOverTitle.textContent = "🎉 You Win!";
        gameOverTitle.style.color = "var(--color-success)";
      } else if (this.aiScore > this.playerScore) {
        gameOverTitle.textContent = "😔 AI Wins!";
        gameOverTitle.style.color = "var(--color-error)";
      } else {
        gameOverTitle.textContent = "🤝 Tie Game!";
        gameOverTitle.style.color = "var(--color-warning)";
      }
    }

    if (finalScores) {
      finalScores.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span>${this.playerName}: <strong>${this.playerScore}</strong></span>
          <span>AI: <strong>${this.aiScore}</strong></span>
        </div>
      `;
    }

    if (gameSummary) {
      const totalRounds = this.currentRound;
      gameSummary.textContent = `Game completed in ${totalRounds} rounds. Thanks for playing!`;
    }

    GameStateManager.changeState(GAME_STATES.SERIES_COMPLETE);
  }

  updateScores() {
    const player1Score = document.getElementById("player1-score");
    const player2Score = document.getElementById("player2-score");

    if (player1Score) player1Score.textContent = this.playerScore.toString();
    if (player2Score) player2Score.textContent = this.aiScore.toString();
  }
}

// Event Handlers
class EventHandlers {
  static init() {
    // Debug toggle
    const debugToggle = document.getElementById("debug-toggle");
    if (debugToggle) {
      debugToggle.addEventListener("click", () => {
        const debugPanel = document.getElementById("debug-panel");
        if (debugPanel) {
          debugPanel.classList.toggle("active");
        }
      });
    }

    // Main menu buttons
    document.getElementById("local-game-btn")?.addEventListener("click", () => {
      GameStateManager.changeState(GAME_STATES.LOCAL_SETUP);
    });

    document
      .getElementById("create-room-btn")
      ?.addEventListener("click", () => {
        if (firebaseAvailable) {
          GameStateManager.changeState(GAME_STATES.CREATE_ROOM);
        } else {
          alert(
            "Firebase is not configured. Please set up Firebase for online multiplayer."
          );
        }
      });

    document.getElementById("join-room-btn")?.addEventListener("click", () => {
      if (firebaseAvailable) {
        GameStateManager.changeState(GAME_STATES.JOIN_ROOM);
      } else {
        alert(
          "Firebase is not configured. Please set up Firebase for online multiplayer."
        );
      }
    });

    // Local mode button from Firebase notice
    document.getElementById("local-mode-btn")?.addEventListener("click", () => {
      const notice = document.getElementById("firebase-notice");
      if (notice) notice.classList.add("hidden");
    });

    // Back buttons
    document.getElementById("back-to-menu")?.addEventListener("click", () => {
      GameStateManager.changeState(GAME_STATES.MENU);
    });

    document.getElementById("back-to-menu-2")?.addEventListener("click", () => {
      GameStateManager.changeState(GAME_STATES.MENU);
    });

    document.getElementById("back-to-menu-3")?.addEventListener("click", () => {
      GameStateManager.changeState(GAME_STATES.MENU);
    });

    // Local game setup
    document
      .getElementById("start-local-game")
      ?.addEventListener("click", () => {
        this.startLocalGame();
      });

    // Online room creation
    document.getElementById("create-room")?.addEventListener("click", () => {
      this.createRoom();
    });

    document.getElementById("copy-room-code")?.addEventListener("click", () => {
      this.copyRoomCode();
    });

    document.getElementById("cancel-room")?.addEventListener("click", () => {
      this.cancelRoom();
    });

    // Join room
    document.getElementById("join-room")?.addEventListener("click", () => {
      this.joinRoom();
    });

    // Choice buttons
    document.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.choice;
        if (choice) {
          this.makeChoice(choice);
        }
      });
    });

    // Game controls
    document.getElementById("quit-game")?.addEventListener("click", () => {
      this.quitGame();
    });

    document.getElementById("next-round-btn")?.addEventListener("click", () => {
      this.nextRound();
    });

    // Game over buttons
    document.getElementById("play-again-btn")?.addEventListener("click", () => {
      this.playAgain();
    });

    document.getElementById("return-to-menu")?.addEventListener("click", () => {
      GameStateManager.changeState(GAME_STATES.MENU);
    });
  }

  static startLocalGame() {
    const playerName =
      document.getElementById("player-name")?.value || "Player";
    const rounds = document.getElementById("rounds-select")?.value || "3";
    const difficulty =
      document.getElementById("difficulty-select")?.value || "adaptive";

    localGameManager.startGame(playerName, rounds, difficulty);
  }

  static async createRoom() {
    const hostName = document.getElementById("host-name")?.value || "Host";
    const rounds = document.getElementById("room-rounds")?.value || "3";
    const createBtn = document.getElementById("create-room");

    if (createBtn) {
      createBtn.classList.add("loading");
    }

    try {
      const result = await FirebaseManager.createRoom(hostName, rounds);
      gameData = { roomCode: result.roomCode, maxRounds: parseInt(rounds) };

      FirebaseManager.setupRoomListener(result.roomCode);
      GameStateManager.changeState(GAME_STATES.WAITING_FOR_PLAYERS, gameData);
    } catch (error) {
      alert("Failed to create room: " + error.message);
      GameLogger.log("CREATE_ROOM_ERROR", { error: error.message });
    } finally {
      if (createBtn) {
        createBtn.classList.remove("loading");
      }
    }
  }

  static copyRoomCode() {
    const roomCodeElement = document.getElementById("room-code");
    if (roomCodeElement && roomCodeElement.textContent) {
      navigator.clipboard
        .writeText(roomCodeElement.textContent)
        .then(() => {
          const btn = document.getElementById("copy-room-code");
          if (btn) {
            const originalText = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(() => {
              btn.textContent = originalText;
            }, 2000);
          }
        })
        .catch(() => {
          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = roomCodeElement.textContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);

          const btn = document.getElementById("copy-room-code");
          if (btn) {
            const originalText = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(() => {
              btn.textContent = originalText;
            }, 2000);
          }
        });
    }
  }

  static async cancelRoom() {
    if (gameData?.roomCode) {
      await FirebaseManager.leaveRoom(gameData.roomCode);
    }
    gameData = null;
    GameStateManager.changeState(GAME_STATES.MENU);
  }

  static async joinRoom() {
    const guestName = document.getElementById("guest-name")?.value || "Guest";
    const roomCode = document
      .getElementById("room-code-input")
      ?.value?.toUpperCase();
    const joinBtn = document.getElementById("join-room");
    const errorElement = document.getElementById("join-error");

    if (!roomCode || roomCode.length !== 6) {
      this.showError(
        errorElement,
        "Please enter a valid 6-character room code"
      );
      return;
    }

    if (joinBtn) {
      joinBtn.classList.add("loading");
    }

    try {
      await FirebaseManager.joinRoom(roomCode, guestName);

      FirebaseManager.setupRoomListener(roomCode);
      GameStateManager.changeState(GAME_STATES.WAITING_FOR_PLAYERS);
    } catch (error) {
      this.showError(errorElement, "Failed to join room: " + error.message);
      GameLogger.log("JOIN_ROOM_ERROR", { roomCode, error: error.message });
    } finally {
      if (joinBtn) {
        joinBtn.classList.remove("loading");
      }
    }
  }

  static showError(element, message) {
    if (element) {
      element.textContent = message;
      element.classList.remove("hidden");
      element.classList.add("error");

      setTimeout(() => {
        element.classList.add("hidden");
      }, 5000);
    }
  }

  static async makeChoice(choice) {
    if (currentGameState === GAME_STATES.ROUND_IN_PROGRESS) {
      if (gameData?.roomCode) {
        // Online game
        try {
          await FirebaseManager.submitChoice(
            gameData.roomCode,
            playerId,
            choice
          );

          // Show waiting state
          const choiceGrid = document.getElementById("choice-grid");
          const waitingState = document.getElementById("waiting-state");
          const waitingMessage = document.getElementById("waiting-message");

          if (choiceGrid) choiceGrid.style.display = "none";
          if (waitingState) waitingState.classList.remove("hidden");
          if (waitingMessage)
            waitingMessage.textContent = "Waiting for opponent...";

          // Update UI with player's choice
          const choiceData = CHOICES.find((c) => c.id === choice);
          const player1ChoiceIcon = document.getElementById(
            "player1-choice-icon"
          );
          const player1ChoiceName = document.getElementById(
            "player1-choice-name"
          );

          if (player1ChoiceIcon && choiceData)
            player1ChoiceIcon.textContent = choiceData.emoji;
          if (player1ChoiceName && choiceData)
            player1ChoiceName.textContent = choiceData.name;
        } catch (error) {
          alert("Failed to submit choice: " + error.message);
          GameLogger.log("SUBMIT_CHOICE_ERROR", {
            choice,
            error: error.message,
          });
        }
      } else {
        // Local game
        localGameManager.makeChoice(choice);
      }
    }
  }

  static async quitGame() {
    if (gameData?.roomCode) {
      await FirebaseManager.leaveRoom(gameData.roomCode);
    }

    gameData = null;
    localGameManager.reset();
    GameStateManager.changeState(GAME_STATES.MENU);
  }

  static nextRound() {
    if (gameData?.roomCode) {
      // Online game - rounds are handled automatically by Firebase
      const roundActions = document.getElementById("round-actions");
      if (roundActions) roundActions.classList.add("hidden");
    } else {
      // Local game
      localGameManager.nextRound();
    }
  }

  static playAgain() {
    if (gameData?.roomCode) {
      alert(
        "Play again functionality for online games requires both players to agree. Returning to main menu."
      );
      GameStateManager.changeState(GAME_STATES.MENU);
    } else {
      // Restart local game with same settings
      const playerName = localGameManager.playerName;
      const maxRounds = localGameManager.maxRounds;
      const difficulty = localGameManager.ai?.difficulty || "adaptive";

      localGameManager.startGame(playerName, maxRounds, difficulty);
    }
  }
}

// Global Instances
let connectionManager;
let localGameManager;

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  GameLogger.log("APP_INIT_START");

  try {
    // Initialize managers
    connectionManager = new ConnectionManager();
    localGameManager = new LocalGameManager();

    // Initialize event handlers
    EventHandlers.init();

    // Initialize Firebase connection
    const firebaseInitialized = await connectionManager.initialize();

    // Start in menu state
    GameStateManager.changeState(GAME_STATES.MENU);

    GameLogger.log("APP_INIT_COMPLETE", { firebaseAvailable });
  } catch (error) {
    GameLogger.log("APP_INIT_ERROR", { error: error.message });
    console.error("Failed to initialize application:", error);
  }
});

// Global error handler
window.addEventListener("error", (event) => {
  GameLogger.log("GLOBAL_ERROR", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
  });
});

// Export for debugging
window.gameDebug = {
  logs: () => GameLogger.getRecentLogs(20),
  state: () => currentGameState,
  data: () => gameData,
  firebase: () => firebaseAvailable,
};
