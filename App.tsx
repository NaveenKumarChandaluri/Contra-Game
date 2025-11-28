
import React from 'react';
import GameEngine from './components/GameEngine';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden relative">
      <div className="scanlines"></div>
      
      {/* Game Container with fixed Aspect Ratio */}
      <div className="relative border-4 border-[#333] shadow-2xl bg-black">
         <GameEngine 
            onGameOver={() => console.log("Game Over")} 
            onExit={() => console.log("Exit")} 
         />
      </div>

      <div className="absolute bottom-4 text-gray-500 text-xs text-center font-mono">
        WASD: Move • SPACE: Jump • L-CLICK: Fire • R-CLICK: Super Weapon • R: Reset
      </div>
    </div>
  );
};

export default App;
