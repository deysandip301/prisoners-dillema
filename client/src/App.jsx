import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Shield, ShieldAlert, MessageCircle, X, Send, User, ChevronRight, Fingerprint } from 'lucide-react';

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001');

const EMOJIS = ['🤝', '🔥', '🤔', '😎', '💀', '💸'];
const springConfig = { type: "spring", stiffness: 300, damping: 25 };

// --- HAPTICS ENGINE ---
// Triggers physical vibrations on mobile devices (Android & supported iOS)
const triggerHaptic = (type = 'light') => {
  if (!window.navigator || typeof window.navigator.vibrate !== 'function') return;
  try {
    switch(type) {
      case 'light': navigator.vibrate(15); break; // Small tap (typing, opening chat)
      case 'medium': navigator.vibrate(40); break; // Medium tap (joining room)
      case 'heavy': navigator.vibrate([40, 30, 40]); break; // Locking in a choice
      case 'success': navigator.vibrate([20, 30, 50, 40]); break; // Round win/Game over
      case 'error': navigator.vibrate([50, 50, 50]); break; // Timeout/Disconnect
      default: navigator.vibrate(15);
    }
  } catch { /* Silently fail on desktop */ }
};

export default function App() {
  const [gameState, setGameState] = useState('menu'); 
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [maxRounds, setMaxRounds] = useState(5);
  const [turnTime, setTurnTime] = useState(30);
  const [currentRound, setCurrentRound] = useState(1);
  const [playerNames, setPlayerNames] = useState({ me: 'You', opponent: 'Opponent' });
  
  const [timeLeft, setTimeLeft] = useState(30);
  const [hasLocked, setHasLocked] = useState(false);
  const [opponentLocked, setOpponentLocked] = useState(false);
  const [roundData, setRoundData] = useState(null);
  const [scores, setScores] = useState({ me: 0, opponent: 0 });
  const [finalResult, setFinalResult] = useState(null);
  const [copied, setCopied] = useState(false);
  
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const chatBottomRef = useRef(null);

  useEffect(() => {
    socket.on('room_created', (code) => { 
      setRoomCode(code); setGameState('lobby'); triggerHaptic('success'); 
    });
    socket.on('game_start', ({ maxRounds, turnTime, players }) => {
      const otherPlayerId = Object.keys(players).find((id) => id !== socket.id);
      setPlayerNames({
        me: players[socket.id] || 'You',
        opponent: players[otherPlayerId] || 'Opponent',
      });
      setMaxRounds(maxRounds); setTurnTime(turnTime); setTimeLeft(turnTime); setGameState('playing'); triggerHaptic('heavy');
    });
    socket.on('opponent_locked', () => {
      setOpponentLocked(true); triggerHaptic('light');
    });
    socket.on('round_result', (data) => {
      setRoundData(data); setScores({ me: data.myScore, opponent: data.opponentScore }); 
      setGameState('round_result'); triggerHaptic('success');
      setTimeout(() => { setHasLocked(false); setOpponentLocked(false); }, 3500);
    });
    socket.on('next_round', (round) => { 
      setCurrentRound(round); setTimeLeft(turnTime); setGameState('playing'); triggerHaptic('medium');
    });
    socket.on('game_over', (result) => {
      setFinalResult(result);
      setGameState('game_over');
      triggerHaptic('success');
    });
    socket.on('player_paused', () => { setGameState('paused'); triggerHaptic('error'); });
    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]); 
      if(msg.sender !== socket.id) triggerHaptic('light'); // Buzz when receiving a message
    });

    return () => socket.off();
  }, [turnTime]);

  const makeChoice = useCallback((choice) => {
    if (hasLocked) return;
    triggerHaptic('heavy');
    setHasLocked(true);
    socket.emit('make_choice', { roomCode, choice });
  }, [hasLocked, roomCode]);

  // Timer Logic
  useEffect(() => {
    if (gameState !== 'playing' || hasLocked) return;
    if (timeLeft <= 0) {
      const timeout = setTimeout(() => {
        triggerHaptic('error');
        makeChoice('defect');
      }, 0);
      return () => clearTimeout(timeout);
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [gameState, timeLeft, hasLocked, makeChoice]);

  useEffect(() => {
    const chatBottom = chatBottomRef.current;
    if (!chatBottom || typeof chatBottom.scrollIntoView !== 'function') return;
    chatBottom.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, showChat]);

  useEffect(() => {
    if (!showChat) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowChat(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showChat]);

  const joinRoom = () => {
    if (!inputCode || !playerName) { triggerHaptic('error'); return alert("Enter name and code."); }
    triggerHaptic('medium');
    socket.emit('join_room', { roomCode: inputCode, playerName });
    setRoomCode(inputCode);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;
    triggerHaptic('light');
    socket.emit('send_message', { roomCode, message: inputMsg, type: 'text' });
    setInputMsg('');
  };

  const sendEmote = (event, message) => {
    event.preventDefault();
    event.stopPropagation();
    if (!roomCode) return;
    triggerHaptic('light');
    socket.emit('send_message', { roomCode, message, type: 'emote' });
  };

  const closeChat = () => {
    setShowChat(false);
    triggerHaptic('light');
  };

  return (
    <div className="app-container flex justify-center">
      
      {/* Light Blue Ethereal Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[500px] h-[500px] bg-sky-300 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob"></div>
        <div className="absolute top-[30%] -right-[10%] w-[400px] h-[400px] bg-cyan-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[600px] h-[600px] bg-blue-300 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-md h-full relative z-10 flex flex-col pt-safe pb-safe shadow-2xl bg-white/5 backdrop-blur-sm sm:border-x sm:border-white/40">
        
        <AnimatePresence mode="wait">
          
          {/* MENU SCREEN */}
          {gameState === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="menu-screen flex-1 flex flex-col p-6 justify-center">
              
              <div className="mb-10 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springConfig} className="w-20 h-20 bg-gradient-to-tr from-sky-400 to-blue-600 rounded-3xl mx-auto shadow-[0_10px_30px_rgba(14,165,233,0.3)] flex items-center justify-center mb-6">
                  <Fingerprint className="w-10 h-10 text-white" />
                </motion.div>
                <h1 className="text-4xl font-black tracking-tighter text-slate-800">The Dilemma</h1>
                <p className="text-sky-600/80 font-bold tracking-widest uppercase text-xs mt-3">A game of trust and betrayal</p>
              </div>

              <div className="space-y-4">
                <div className="glass-panel p-2 rounded-3xl flex items-center pr-4">
                  <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-sky-600" />
                  </div>
                  <input type="text" placeholder="Your Name" value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                    className="flex-1 bg-transparent px-4 font-bold text-slate-800 placeholder-slate-400 focus:outline-none" />
                </div>

                <div className="glass-panel p-6 rounded-3xl space-y-6">
                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-600 mb-2"><span>Rounds</span> <span className="text-sky-600">{maxRounds}</span></div>
                    <input type="range" min="1" max="50" value={maxRounds} onChange={(e) => { setMaxRounds(e.target.value); triggerHaptic('light'); }} className="w-full accent-sky-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-600 mb-2"><span>Turn Time</span> <span className="text-sky-600">{turnTime}s</span></div>
                    <input type="range" min="10" max="60" step="5" value={turnTime} onChange={(e) => { setTurnTime(e.target.value); triggerHaptic('light'); }} className="w-full accent-sky-500" />
                  </div>
                  
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => { if(!playerName) { triggerHaptic('error'); return alert("Name required"); } triggerHaptic('medium'); socket.emit('create_room', { maxRounds, turnTime, playerName }); }}
                    className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-[0_10px_30px_rgba(14,165,233,0.3)] flex items-center justify-center gap-2 transition-all">
                    Host Game <ChevronRight className="w-5 h-5" />
                  </motion.button>
                </div>

                <div className="glass-panel p-2 rounded-3xl flex">
                  <input type="text" placeholder="Paste Code" value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    className="flex-1 bg-transparent px-6 font-mono font-bold text-slate-800 uppercase focus:outline-none placeholder-slate-400" />
                  <motion.button whileTap={{ scale: 0.95 }} onClick={joinRoom} className="bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold shadow-lg">
                    Join
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* LOBBY SCREEN */}
          {gameState === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="glass-panel p-8 rounded-[40px] w-full max-w-sm flex flex-col items-center">
                <div className="w-24 h-24 bg-sky-100 rounded-full flex items-center justify-center mb-6 relative z-10">
                  <div className="w-16 h-16 bg-sky-200 rounded-full flex items-center justify-center animate-pulse">
                    <Fingerprint className="w-8 h-8 text-sky-600" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 relative z-10">Awaiting Target</h2>
                <p className="text-sky-600 mt-2 font-medium relative z-10">Share this secure code</p>
                
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => { navigator.clipboard.writeText(roomCode); setCopied(true); triggerHaptic('success'); setTimeout(() => setCopied(false), 2000); }} 
                  className="mt-8 flex items-center gap-4 bg-white/60 px-6 py-4 rounded-3xl shadow-lg w-full border border-white relative z-10 group">
                  <span className="text-4xl font-black font-mono text-slate-800 tracking-widest flex-1">{roomCode}</span>
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                    {copied ? <Check className="text-emerald-500" /> : <Copy className="text-sky-500" />}
                  </div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* PLAYING SCREEN */}
          {gameState === 'playing' && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col h-full">
              
              <div className="game-hud z-10">
                <div className="score-panel glass-pill">
                  <div className="round-label">Round {currentRound} <span>/ {maxRounds}</span></div>
                  <div className="score-values">
                    <div><span title={playerNames.me}>{playerNames.me}</span><strong>{scores.me}</strong></div>
                    <i>-</i>
                    <div><span title={playerNames.opponent}>{playerNames.opponent}</span><strong>{scores.opponent}</strong></div>
                  </div>
                </div>
                <div className={`timer-panel glass-pill ${timeLeft <= 5 ? 'timer-panel--urgent' : ''}`} aria-label={`${timeLeft} seconds remaining`}>
                  <div className="timer-ring">
                    <svg viewBox="0 0 64 64" aria-hidden="true">
                      <circle cx="32" cy="32" r="27" className="timer-track" />
                      <motion.circle cx="32" cy="32" r="27" className="timer-progress" strokeDasharray="169.6"
                        initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: 169.6 - (169.6 * (timeLeft / turnTime)) }} transition={{ duration: 1, ease: 'linear' }} />
                    </svg>
                    <strong>{timeLeft}</strong>
                  </div>
                  <div className="timer-copy"><span>Decision</span><strong>seconds</strong></div>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                  <Shield className="w-64 h-64 text-sky-900" />
                </div>
                <h2 className="text-3xl font-black text-slate-800 mb-2">Your Move.</h2>
                <p className="text-sky-700 font-bold h-6">
                  {hasLocked ? (opponentLocked ? "Analyzing sequence..." : "Waiting for opponent...") : (opponentLocked ? "Opponent is locked in!" : "Time is ticking.")}
                </p>
              </div>

              <div className="p-6 pb-8 grid grid-cols-2 gap-4 z-10 relative">
                {/* Cooperate Button - Light Blue Theme */}
                <motion.button whileTap={!hasLocked ? { scale: 0.92 } : {}} disabled={hasLocked} onClick={() => makeChoice('cooperate')}
                  className={`relative overflow-hidden rounded-[32px] p-6 flex flex-col items-center justify-center h-48 transition-all ${hasLocked ? 'opacity-50 grayscale' : 'glass-panel hover:shadow-[0_20px_40px_-10px_rgba(14,165,233,0.4)] border border-white'}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-sky-50 to-blue-50 opacity-80"></div>
                  <Shield className="w-12 h-12 text-sky-500 mb-4 relative z-10" />
                  <span className="text-xl font-black text-slate-800 relative z-10">Trust</span>
                  <span className="text-[10px] font-black text-sky-500 mt-1 relative z-10 uppercase tracking-widest">Cooperate</span>
                </motion.button>

                {/* Defect Button - Soft Coral/Rose to contrast the blue */}
                <motion.button whileTap={!hasLocked ? { scale: 0.92 } : {}} disabled={hasLocked} onClick={() => makeChoice('defect')}
                  className={`relative overflow-hidden rounded-[32px] p-6 flex flex-col items-center justify-center h-48 transition-all ${hasLocked ? 'opacity-50 grayscale' : 'glass-panel hover:shadow-[0_20px_40px_-10px_rgba(244,63,94,0.4)] border border-white'}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-50 to-orange-50 opacity-80"></div>
                  <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 relative z-10" />
                  <span className="text-xl font-black text-slate-800 relative z-10">Betray</span>
                  <span className="text-[10px] font-black text-rose-500 mt-1 relative z-10 uppercase tracking-widest">Defect</span>
                </motion.button>
              </div>

              {/* Chat trigger */}
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowChat(true); triggerHaptic('light'); }}
                className="absolute bottom-32 right-6 w-14 h-14 bg-gradient-to-r from-sky-400 to-blue-500 rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(14,165,233,0.4)] z-20">
                <MessageCircle className="w-6 h-6 text-white" />
                {messages.length > 0 && <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 rounded-full border-2 border-white"></span>}
              </motion.button>
            </motion.div>
          )}

          {gameState === 'round_result' && roundData && (
            <motion.div key="round-result" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="state-screen">
              <span className="eyebrow">Round {currentRound} settled</span>
              <h2 className="display-title">The table has<br /><em>spoken.</em></h2>
              <div className="result-card">
                <div className="result-card__label">Your decision</div>
                <div className="result-card__choice">{roundData.myChoice === 'cooperate' ? 'Trust' : 'Betray'}</div>
                <div className="result-card__gain">+{roundData.myGain} points</div>
                <div className="score-line"><span>You {scores.me}</span><span>Opponent {scores.opponent}</span></div>
              </div>
              <p className="state-note">Next round begins shortly.</p>
            </motion.div>
          )}

          {gameState === 'game_over' && (
            <motion.div key="game-over" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="state-screen">
              <span className="eyebrow">Final score</span>
              <h2 className="display-title">{finalResult?.isTie ? <>A perfectly<br /><em>even table.</em></> : <>We have a<br /><em>winner.</em></>}</h2>
              {finalResult && (
                <div className="final-scoreboard">
                  {finalResult.players.map((player) => (
                    <div key={player.id} className={`final-player ${finalResult.winnerIds.includes(player.id) ? 'final-player--winner' : ''}`}>
                      <span>{player.name}</span>
                      <strong>{player.score}</strong>
                      {!finalResult.isTie && finalResult.winnerIds.includes(player.id) && <em>Winner</em>}
                    </div>
                  ))}
                </div>
              )}
              <p className="state-note">{finalResult?.isTie ? 'Both players leave the table level.' : 'A decisive finish to the match.'}</p>
              <button type="button" onClick={() => window.location.reload()} className="primary-action">Return to lobby <ChevronRight size={18} /></button>
            </motion.div>
          )}

          {gameState === 'paused' && (
            <motion.div key="paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="state-screen">
              <ShieldAlert className="state-icon" size={42} />
              <span className="eyebrow">Connection interrupted</span>
              <h2 className="display-title">Hold your<br /><em>position.</em></h2>
              <p className="state-note">Your opponent has 60 seconds to return to the table.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM SHEET CHAT OVERLAY */}
        <AnimatePresence>
          {showChat && (
            <>
              <motion.button type="button" aria-label="Close chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeChat}
                className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm z-40" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={springConfig}
                role="dialog" aria-modal="true" aria-label="Tactical Comms"
                className="chat-sheet absolute bottom-0 left-0 right-0 h-3/4 bg-white/90 backdrop-blur-3xl rounded-t-[40px] shadow-[0_-10px_40px_rgba(14,165,233,0.1)] border-t border-white z-50 flex flex-col">
                
                <div className="p-4 flex justify-between items-center border-b border-sky-100">
                  <h3 className="font-bold text-slate-800 ml-4">Tactical Comms</h3>
                  <button type="button" onClick={closeChat} aria-label="Close chat" className="w-10 h-10 bg-sky-50 rounded-full flex items-center justify-center text-sky-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.sender === socket.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-4 py-3 rounded-3xl max-w-[80%] shadow-sm ${m.type === 'emote' ? 'text-4xl bg-transparent shadow-none p-0' : m.sender === socket.id ? 'bg-gradient-to-r from-sky-500 to-blue-500 text-white font-medium rounded-br-sm' : 'bg-white border border-sky-100 text-slate-800 font-medium rounded-bl-sm'}`}>
                        {m.message}
                      </div>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                <div className="p-4 bg-white/50 backdrop-blur-md border-t border-sky-50">
                  <div className="flex justify-around mb-4">
                    {EMOJIS.map((e) => (
                      <button type="button" key={e} onClick={(event) => sendEmote(event, e)} aria-label={`Send ${e}`} className="chat-emoji hover:scale-110 active:scale-95 transition-transform">{e}</button>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} className="flex gap-2 bg-sky-50 p-2 rounded-[24px]">
                    <input type="text" placeholder="Send message..." value={inputMsg} onChange={(e) => setInputMsg(e.target.value)}
                      className="flex-1 bg-transparent px-4 text-slate-800 focus:outline-none font-medium" />
                    <button type="submit" className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-md">
                      <Send className="w-4 h-4 ml-1" />
                    </button>
                  </form>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}