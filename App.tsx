import React, { useState } from 'react';
import GameEngine from './components/GameEngine';

enum AppState {
  MENU,
  PLAYING,
  GAMEOVER
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.MENU);
  const [lastScore, setLastScore] = useState(0);

  const startGame = () => setAppState(AppState.PLAYING);
  
  const handleGameOver = (score: number) => {
    setLastScore(score);
    setAppState(AppState.GAMEOVER);
  };

  const toMenu = () => setAppState(AppState.MENU);

  return (
    <div className="w-screen h-screen bg-neutral-900 flex items-center justify-center overflow-hidden relative">
      
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[url('https://picsum.photos/1920/1080?grayscale&blur=10')] opacity-10 bg-cover pointer-events-none"></div>

      {appState === AppState.MENU && (
        <div className="z-50 flex flex-col items-center gap-8 bg-black p-12 border-4 border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)] rounded-lg animate-fade-in">
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-400 to-red-600 tracking-tighter drop-shadow-sm" style={{ fontFamily: '"Press Start 2P", cursive', textShadow: '4px 4px 0px #500' }}>
            CONTRA<br/>REACT
          </h1>
          <p className="text-gray-400 text-sm font-mono mt-[-20px]">OPERATION: JUNGLE STORM</p>
          
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button 
              onClick={startGame}
              className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold font-mono tracking-widest text-xl transition-all border-b-4 border-red-900 hover:border-red-700 active:translate-y-1 active:border-b-0"
            >
              START MISSION
            </button>
          </div>
          
          <div className="text-gray-500 text-xs text-center font-mono leading-relaxed">
            CONTROLS:<br/>
            [WASD] / ARROWS to Move<br/>
            [SPACE] / [Z] to Jump<br/>
            [J] / [X] to Shoot
          </div>
        </div>
      )}

      {appState === AppState.PLAYING && (
        <GameEngine onGameOver={handleGameOver} onExit={toMenu} />
      )}

      {appState === AppState.GAMEOVER && (
        <div className="z-50 flex flex-col items-center gap-6 bg-black p-12 border-4 border-gray-700 shadow-2xl rounded-lg">
          <h2 className="text-5xl text-red-600 font-bold tracking-widest" style={{ fontFamily: '"Press Start 2P", cursive' }}>
            GAME OVER
          </h2>
          <div className="text-2xl text-white font-mono">
            SCORE: <span className="text-yellow-400">{lastScore}</span>
          </div>
          <button 
            onClick={startGame}
            className="mt-4 px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-mono font-bold border-b-4 border-gray-900 active:border-b-0 active:translate-y-1 transition-all"
          >
            CONTINUE?
          </button>
          <button 
            onClick={toMenu}
            className="text-gray-500 hover:text-white text-xs mt-4 underline font-mono"
          >
            RETURN TO BASE
          </button>
        </div>
      )}
      
      {/* Scanline overlay for the whole screen feel */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent to-black opacity-20 bg-[length:100%_4px]"></div>
    </div>
  );
};

export default App;