// Game Data
const gameRules = {
  rock: { beats: ['lizard', 'scissors'], actions: ['crushes', 'crushes'] },
  paper: { beats: ['rock', 'spock'], actions: ['covers', 'disproves'] },
  scissors: { beats: ['paper', 'lizard'], actions: ['cuts', 'decapitates'] },
  lizard: { beats: ['spock', 'paper'], actions: ['poisons', 'eats'] },
  spock: { beats: ['scissors', 'rock'], actions: ['smashes', 'vaporizes'] }
};

const choices = [
  { id: 'rock', name: 'Rock', emoji: '🗿' },
  { id: 'paper', name: 'Paper', emoji: '📄' },
  { id: 'scissors', name: 'Scissors', emoji: '✂️' },
  { id: 'lizard', name: 'Lizard', emoji: '🦎' },
  { id: 'spock', name: 'Spock', emoji: '🖖' }
];

// Game State
let gameState = {
  currentSection: 'main-menu',
  gameMode: 'local',
  difficulty: 'medium',
  maxGames: 3,
  currentGame: 0,
  player1: { name: 'Player 1', score: 0, choice: null },
  player2: { name: 'Computer', score: 0, choice: null },
  gameHistory: [],
  playerHistory: [],
  rooms: new Map(),
  currentRoomCode: null,
  isGameActive: false,
  waitingForChoice: false,
  leaderboard: []
};

// Navigation System
class NavigationManager {
  constructor() {
    this.init();
  }

  init() {
    // Handle menu card clicks
    document.querySelectorAll('[data-section]').forEach(element => {
      element.addEventListener('click', (e) => {
        const section = e.currentTarget.dataset.section;
        this.navigateTo(section);
      });
    });

    // Show main menu navigation when not on main menu
    this.updateNavigation();
  }

  navigateTo(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });

    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.classList.add('active');
      gameState.currentSection = sectionId;
      this.updateNavigation();
    }
  }

  updateNavigation() {
    const navBtn = document.getElementById('main-nav').querySelector('.nav-btn');
    if (gameState.currentSection === 'main-menu') {
      navBtn.classList.remove('show');
    } else {
      navBtn.classList.add('show');
    }
  }
}

// Game Logic
class GameEngine {
  constructor() {
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Create game form
    document.getElementById('start-game').addEventListener('click', () => this.startGame());
    
    // Game mode radio buttons
    document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.handleGameModeChange(e.target.value));
    });

    // Join game
    document.getElementById('join-game-btn').addEventListener('click', () => this.joinGame());

    // Choice buttons
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.makeChoice(e.currentTarget.dataset.choice));
    });

    // Game controls
    document.getElementById('next-round').addEventListener('click', () => this.nextRound());
    document.getElementById('play-again').addEventListener('click', () => this.playAgain());
    document.getElementById('play-again-modal').addEventListener('click', () => this.playAgain());
    document.getElementById('quit-game').addEventListener('click', () => this.quitGame());
    document.getElementById('main-menu-modal').addEventListener('click', () => this.quitGame());

    // Copy room code
    document.getElementById('copy-code').addEventListener('click', () => this.copyRoomCode());
  }

  handleGameModeChange(mode) {
    gameState.gameMode = mode;
    const difficultyGroup = document.getElementById('difficulty-group');
    const roomCodeDisplay = document.getElementById('room-code-display');
    
    if (mode === 'local') {
      difficultyGroup.style.display = 'block';
      roomCodeDisplay.classList.add('hidden');
    } else {
      difficultyGroup.style.display = 'none';
      roomCodeDisplay.classList.remove('hidden');
      this.generateRoomCode();
    }
  }

  generateRoomCode() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    gameState.currentRoomCode = code;
    document.getElementById('room-code-text').textContent = code;
    
    // Create room in memory
    gameState.rooms.set(code, {
      host: gameState.player1.name,
      guest: null,
      gameSettings: {
        maxGames: parseInt(document.getElementById('gameCount').value),
        difficulty: document.getElementById('difficulty').value
      },
      gameState: 'waiting'
    });
  }

  copyRoomCode() {
    const code = document.getElementById('room-code-text').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('copy-code');
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  }

  joinGame() {
    const roomCode = document.getElementById('room-code-input').value.toUpperCase();
    const playerName = document.getElementById('join-player-name').value || 'Player 2';
    const statusElement = document.getElementById('join-status');

    if (!roomCode || roomCode.length !== 6) {
      this.showStatus(statusElement, 'Please enter a valid 6-digit room code', 'error');
      return;
    }

    const room = gameState.rooms.get(roomCode);
    if (!room) {
      this.showStatus(statusElement, 'Room not found. Please check the room code.', 'error');
      return;
    }

    if (room.guest) {
      this.showStatus(statusElement, 'Room is full. Please try another room.', 'error');
      return;
    }

    // Join the room
    room.guest = playerName;
    gameState.currentRoomCode = roomCode;
    gameState.player1.name = playerName;
    gameState.player2.name = room.host;
    gameState.gameMode = 'online';
    gameState.maxGames = room.gameSettings.maxGames;

    this.showStatus(statusElement, 'Successfully joined the game!', 'success');
    
    setTimeout(() => {
      this.initializeGame();
      navigationManager.navigateTo('game-play');
    }, 1500);
  }

  startGame() {
    // Get form values
    gameState.player1.name = document.getElementById('playerName').value || 'Player 1';
    gameState.maxGames = parseInt(document.getElementById('gameCount').value);
    gameState.difficulty = document.getElementById('difficulty').value;

    if (gameState.gameMode === 'local') {
      gameState.player2.name = 'Computer';
    }

    this.initializeGame();
    navigationManager.navigateTo('game-play');
  }

  initializeGame() {
    // Reset game state
    gameState.currentGame = 0;
    gameState.player1.score = 0;
    gameState.player2.score = 0;
    gameState.gameHistory = [];
    gameState.playerHistory = [];
    gameState.isGameActive = true;
    gameState.waitingForChoice = false;

    this.updateGameUI();
    this.resetRound();
  }

  updateGameUI() {
    document.getElementById('player1-name').textContent = gameState.player1.name;
    document.getElementById('player2-name').textContent = gameState.player2.name;
    document.getElementById('player1-score').textContent = gameState.player1.score;
    document.getElementById('player2-score').textContent = gameState.player2.score;
    
    const progressText = gameState.maxGames === -1 
      ? `Round ${gameState.currentGame + 1}`
      : `Round ${gameState.currentGame + 1} of ${gameState.maxGames}`;
    document.getElementById('game-progress-text').textContent = progressText;
  }

  resetRound() {
    gameState.player1.choice = null;
    gameState.player2.choice = null;
    gameState.waitingForChoice = false;

    // Reset UI
    document.getElementById('player1-choice').textContent = '?';
    document.getElementById('player1-choice-name').textContent = 'Make your choice';
    document.getElementById('player2-choice').textContent = '?';
    document.getElementById('player2-choice-name').textContent = 'Waiting...';
    document.getElementById('round-result').textContent = '';
    document.getElementById('result-explanation').textContent = '';

    // Reset choice buttons
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
      btn.disabled = false;
    });

    // Reset choice icons
    document.querySelectorAll('.choice-icon').forEach(icon => {
      icon.classList.remove('winner', 'loser');
    });

    // Hide/show controls
    document.getElementById('next-round').classList.add('hidden');
    document.getElementById('play-again').classList.add('hidden');
  }

  makeChoice(choice) {
    if (!gameState.isGameActive || gameState.waitingForChoice) return;

    gameState.player1.choice = choice;
    gameState.waitingForChoice = true;

    // Update UI
    const choiceData = choices.find(c => c.id === choice);
    document.getElementById('player1-choice').textContent = choiceData.emoji;
    document.getElementById('player1-choice-name').textContent = choiceData.name;

    // Highlight selected button
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
      if (btn.dataset.choice === choice) {
        btn.classList.add('selected');
      }
      btn.disabled = true;
    });

    // Store player choice for AI learning
    gameState.playerHistory.push(choice);

    // Get computer/opponent choice
    if (gameState.gameMode === 'local') {
      gameState.player2.choice = this.getComputerChoice();
    } else {
      // For online game, simulate opponent choice (in real implementation, this would come from server)
      setTimeout(() => {
        gameState.player2.choice = this.getRandomChoice();
        this.resolveRound();
      }, 1000 + Math.random() * 2000);
      return;
    }

    // Small delay for better UX
    setTimeout(() => {
      this.resolveRound();
    }, 1000);
  }

  getComputerChoice() {
    const allChoices = choices.map(c => c.id);
    
    switch (gameState.difficulty) {
      case 'easy':
        return this.getRandomChoice();
        
      case 'medium':
        return this.getMediumAIChoice(allChoices);
        
      case 'hard':
        return this.getHardAIChoice(allChoices);
        
      default:
        return this.getRandomChoice();
    }
  }

  getRandomChoice() {
    const allChoices = choices.map(c => c.id);
    return allChoices[Math.floor(Math.random() * allChoices.length)];
  }

  getMediumAIChoice(allChoices) {
    // Medium AI: Look for patterns in last 3 moves
    if (gameState.playerHistory.length < 3) {
      return this.getRandomChoice();
    }

    const recent = gameState.playerHistory.slice(-3);
    const mostCommon = this.getMostCommonChoice(recent);
    
    if (mostCommon && Math.random() < 0.6) {
      return this.getCounterChoice(mostCommon);
    }
    
    return this.getRandomChoice();
  }

  getHardAIChoice(allChoices) {
    // Hard AI: Advanced pattern recognition and counter-strategies
    if (gameState.playerHistory.length < 2) {
      return this.getRandomChoice();
    }

    // Look for patterns in last 5 moves
    const recent = gameState.playerHistory.slice(-5);
    
    // Check for sequences
    const lastChoice = recent[recent.length - 1];
    const sequence = this.findSequencePattern(recent);
    
    if (sequence && Math.random() < 0.7) {
      return this.getCounterChoice(sequence);
    }
    
    // Counter the most frequent recent choice
    const mostCommon = this.getMostCommonChoice(recent);
    if (mostCommon && Math.random() < 0.8) {
      return this.getCounterChoice(mostCommon);
    }
    
    // Random fallback
    return this.getRandomChoice();
  }

  getMostCommonChoice(choices) {
    const counts = {};
    choices.forEach(choice => {
      counts[choice] = (counts[choice] || 0) + 1;
    });
    
    return Object.keys(counts).reduce((a, b) => 
      counts[a] > counts[b] ? a : b
    );
  }

  findSequencePattern(choices) { 
    // Look for repeating patterns
    if (choices.length < 4) return null;
    
    const lastTwo = choices.slice(-2);
    for (let i = 0; i < choices.length - 3; i++) {
      if (choices[i] === lastTwo[0] && choices[i + 1] === lastTwo[1]) {
        // Found pattern, predict next choice
        if (i + 2 < choices.length) {
          return choices[i + 2];
        }
      }
    }
    
    return null;
  }

  getCounterChoice(choice) {
    // Get a choice that beats the predicted choice
    const allChoices = choices.map(c => c.id);
    const counters = allChoices.filter(c => 
      gameRules[c].beats.includes(choice)
    );
    
    if (counters.length > 0) {
      return counters[Math.floor(Math.random() * counters.length)];
    }
    
    return this.getRandomChoice();
  }

  resolveRound() {
    const player1Choice = gameState.player1.choice;
    const player2Choice = gameState.player2.choice;

    // Update UI with choices
    const p2ChoiceData = choices.find(c => c.id === player2Choice);
    document.getElementById('player2-choice').textContent = p2ChoiceData.emoji;
    document.getElementById('player2-choice-name').textContent = p2ChoiceData.name;

    // Determine winner
    const result = this.determineWinner(player1Choice, player2Choice);
    
    // Update scores
    if (result.winner === 1) {
      gameState.player1.score++;
    } else if (result.winner === 2) {
      gameState.player2.score++;
    }

    // Update UI with result
    this.displayRoundResult(result);
    this.updateGameUI();

    // Store round result
    gameState.gameHistory.push({
      round: gameState.currentGame + 1,
      player1Choice,
      player2Choice,
      winner: result.winner,
      explanation: result.explanation
    });

    gameState.currentGame++;

    // Check if game is over
    if (this.isGameOver()) {
      setTimeout(() => this.endGame(), 2000);
    } else {
      // Show next round button
      document.getElementById('next-round').classList.remove('hidden');
    }
  }

  determineWinner(choice1, choice2) {
    if (choice1 === choice2) {
      return { winner: 0, explanation: "It's a tie!" };
    }

    const choice1Rules = gameRules[choice1];
    const choice1Data = choices.find(c => c.id === choice1);
    const choice2Data = choices.find(c => c.id === choice2);

    if (choice1Rules.beats.includes(choice2)) {
      const actionIndex = choice1Rules.beats.indexOf(choice2);
      const action = choice1Rules.actions[actionIndex];
      return {
        winner: 1,
        explanation: `${choice1Data.name} ${action} ${choice2Data.name}`
      };
    } else {
      const choice2Rules = gameRules[choice2];
      const actionIndex = choice2Rules.beats.indexOf(choice1);
      const action = choice2Rules.actions[actionIndex];
      return {
        winner: 2,
        explanation: `${choice2Data.name} ${action} ${choice1Data.name}`
      };
    }
  }

  displayRoundResult(result) {
    const resultElement = document.getElementById('round-result');
    const explanationElement = document.getElementById('result-explanation');
    
    // Update choice icons based on result
    const player1Icon = document.getElementById('player1-choice');
    const player2Icon = document.getElementById('player2-choice');
    
    if (result.winner === 1) {
      resultElement.textContent = 'You Win!';
      resultElement.className = 'win';
      player1Icon.classList.add('winner');
      player2Icon.classList.add('loser');
    } else if (result.winner === 2) {
      resultElement.textContent = `${gameState.player2.name} Wins!`;
      resultElement.className = 'lose';
      player1Icon.classList.add('loser');
      player2Icon.classList.add('winner');
    } else {
      resultElement.textContent = "It's a Tie!";
      resultElement.className = 'tie';
    }
    
    explanationElement.textContent = result.explanation;
  }

  isGameOver() {
    if (gameState.maxGames === -1) return false; // Unlimited mode
    
    return gameState.currentGame >= gameState.maxGames;
  }

  endGame() {
    gameState.isGameActive = false;
    
    // Update leaderboard
    this.updateLeaderboard();
    
    // Show game over modal
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const finalScore = document.getElementById('final-score');
    
    const p1Score = gameState.player1.score;
    const p2Score = gameState.player2.score;
    
    if (p1Score > p2Score) {
      title.textContent = '🎉 You Win!';
      title.style.color = 'var(--color-success)';
    } else if (p2Score > p1Score) {
      title.textContent = `😔 ${gameState.player2.name} Wins!`;
      title.style.color = 'var(--color-error)';
    } else {
      title.textContent = "🤝 It's a Tie!";
      title.style.color = 'var(--color-warning)';
    }
    
    finalScore.innerHTML = `
      <div class="final-score-display">
        <div class="score-row">
          <span>${gameState.player1.name}: ${p1Score}</span>
        </div>
        <div class="score-row">
          <span>${gameState.player2.name}: ${p2Score}</span>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
  }

  updateLeaderboard() {
    const playerName = gameState.player1.name;
    const totalGames = gameState.currentGame;
    const wins = gameState.player1.score;
    const losses = gameState.player2.score;
    const ties = totalGames - wins - losses;

    // Find existing player or create new entry
    let playerEntry = gameState.leaderboard.find(p => p.name === playerName);
    
    if (!playerEntry) {
      playerEntry = {
        name: playerName,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        totalTies: 0,
        winStreak: 0,
        maxWinStreak: 0
      };
      gameState.leaderboard.push(playerEntry);
    }

    // Update stats
    playerEntry.totalGames += totalGames;
    playerEntry.totalWins += wins;
    playerEntry.totalLosses += losses;
    playerEntry.totalTies += ties;

    // Update win streak
    const finalResult = wins > losses ? 'win' : losses > wins ? 'loss' : 'tie';
    if (finalResult === 'win') {
      playerEntry.winStreak++;
      playerEntry.maxWinStreak = Math.max(playerEntry.maxWinStreak, playerEntry.winStreak);
    } else if (finalResult === 'loss') {
      playerEntry.winStreak = 0;
    }

    // Update leaderboard display
    leaderboardManager.updateDisplay();
  }

  nextRound() {
    this.resetRound();
  }

  playAgain() {
    // Hide modal
    document.getElementById('game-over-modal').classList.add('hidden');
    
    // Reset and start new game with same settings
    this.initializeGame();
  }

  quitGame() {
    // Hide modal if open
    document.getElementById('game-over-modal').classList.add('hidden');
    
    // Clean up room if online game
    if (gameState.gameMode === 'online' && gameState.currentRoomCode) {
      gameState.rooms.delete(gameState.currentRoomCode);
    }
    
    // Reset game state
    gameState.isGameActive = false;
    gameState.currentRoomCode = null;
    
    // Navigate to main menu
    navigationManager.navigateTo('main-menu');
  }

  showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.classList.remove('hidden');
    
    setTimeout(() => {
      element.classList.add('hidden');
    }, 5000);
  }
}

// Feedback System
class FeedbackManager {
  constructor() {
    this.currentRating = 5;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Star rating
    document.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', (e) => this.setRating(parseInt(e.target.dataset.rating)));
    });

    // Form submission
    document.getElementById('feedback-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitFeedback();
    });
  }

  setRating(rating) {
    this.currentRating = rating;
    
    // Update star display
    document.querySelectorAll('.star').forEach((star, index) => {
      if (index < rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
    
    // Update rating text
    const ratingTexts = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent'];
    document.querySelector('.rating-text').textContent = 
      `Click to rate (${rating} star${rating !== 1 ? 's' : ''} - ${ratingTexts[rating - 1]})`;
  }

  submitFeedback() {
    const name = document.getElementById('feedback-name').value;
    const email = document.getElementById('feedback-email').value;
    const message = document.getElementById('feedback-message').value;

    if (!message.trim()) {
      alert('Please enter your feedback message.');
      return;
    }

    // Simulate feedback submission
    console.log('Feedback submitted:', {
      name: name || 'Anonymous',
      email,
      rating: this.currentRating,
      message
    });

    // Show success message
    document.getElementById('feedback-form').classList.add('hidden');
    document.getElementById('feedback-success').classList.remove('hidden');

    // Reset form after delay
    setTimeout(() => {
      this.resetForm();
    }, 3000);
  }

  resetForm() {
    document.getElementById('feedback-form').reset();
    document.getElementById('feedback-form').classList.remove('hidden');
    document.getElementById('feedback-success').classList.add('hidden');
    this.setRating(5);
  }
}

// Leaderboard Manager
class LeaderboardManager {
  constructor() {
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    document.getElementById('sort-by').addEventListener('change', () => {
      this.updateDisplay();
    });
  }

  updateDisplay() {
    const sortBy = document.getElementById('sort-by').value;
    const tbody = document.getElementById('leaderboard-body');
    
    if (gameState.leaderboard.length === 0) {
      tbody.innerHTML = '<div class="empty-state"><p>No games played yet. Start playing to see statistics!</p></div>';
      return;
    }

    // Sort leaderboard
    const sorted = [...gameState.leaderboard].sort((a, b) => {
      switch (sortBy) {
        case 'winPercentage':
          const aPercent = a.totalGames > 0 ? (a.totalWins / a.totalGames) * 100 : 0;
          const bPercent = b.totalGames > 0 ? (b.totalWins / b.totalGames) * 100 : 0;
          return bPercent - aPercent;
        case 'totalWins':
          return b.totalWins - a.totalWins;
        case 'totalGames':
          return b.totalGames - a.totalGames;
        case 'winStreak':
          return b.winStreak - a.winStreak;
        default:
          return 0;
      }
    });

    // Generate HTML
    let html = '';
    sorted.forEach((player, index) => {
      const winPercentage = player.totalGames > 0 
        ? Math.round((player.totalWins / player.totalGames) * 100)
        : 0;
      
      const rankClass = index < 3 ? `rank-${index + 1}` : '';
      
      html += `
        <div class="table-row">
          <div class="table-cell ${rankClass}">${index + 1}</div>
          <div class="table-cell">${player.name}</div>
          <div class="table-cell">${winPercentage}%</div>
          <div class="table-cell">${player.totalWins}/${player.totalLosses}/${player.totalTies}</div>
          <div class="table-cell">${player.winStreak}</div>
        </div>
      `;
    });

    tbody.innerHTML = html;
  }
}

// Initialize Application
let navigationManager;
let gameEngine;
let feedbackManager;
let leaderboardManager;

document.addEventListener('DOMContentLoaded', () => {
  navigationManager = new NavigationManager();
  gameEngine = new GameEngine();
  feedbackManager = new FeedbackManager();
  leaderboardManager = new LeaderboardManager();
  
  // Initialize with some sample leaderboard data for demonstration
  gameState.leaderboard = [
    { name: 'AI Master', totalGames: 100, totalWins: 75, totalLosses: 20, totalTies: 5, winStreak: 5, maxWinStreak: 12 },
    { name: 'Rock Star', totalGames: 50, totalWins: 30, totalLosses: 15, totalTies: 5, winStreak: 2, maxWinStreak: 8 },
    { name: 'Paper Trail', totalGames: 25, totalWins: 15, totalLosses: 8, totalTies: 2, winStreak: 0, maxWinStreak: 4 }
  ];
  
  leaderboardManager.updateDisplay();
});