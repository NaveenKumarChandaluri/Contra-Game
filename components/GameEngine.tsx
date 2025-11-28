import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EntityType, GameObject, GameState, InputState, Vector2 } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, PLAYER_SPEED, JUMP_FORCE, BULLET_SPEED, ENEMY_SPEED, SPAWN_RATE, COLORS, SIZES } from '../constants';

interface GameEngineProps {
  onGameOver: (score: number) => void;
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ onGameOver, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Game State Refs (Mutable for performance loop)
  const cameraRef = useRef<Vector2>({ x: 0, y: 0 });
  const playerRef = useRef<GameObject>({
    id: 'player',
    type: EntityType.PLAYER,
    pos: { x: 100, y: 100 },
    vel: { x: 0, y: 0 },
    size: { ...SIZES.PLAYER },
    color: COLORS.PLAYER_PANTS,
    health: 1,
    active: true,
    facing: 1,
    grounded: false,
    cooldown: 0,
    state: 'idle'
  });
  
  const entitiesRef = useRef<GameObject[]>([]);
  const particlesRef = useRef<GameObject[]>([]);
  const inputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false, jump: false, shoot: false
  });
  
  // React State for UI HUD
  const [hudState, setHudState] = useState<GameState>({
    score: 0,
    lives: 3,
    gameOver: false,
    gameWon: false,
    highScore: parseInt(localStorage.getItem('contra_highscore') || '0'),
  });

  // Level Generation
  const generateLevel = useCallback(() => {
    const platforms: GameObject[] = [];
    const floorY = CANVAS_HEIGHT - 40;
    
    // Initial ground
    platforms.push({
      id: 'floor-0',
      type: EntityType.PLATFORM,
      pos: { x: -200, y: floorY },
      vel: { x: 0, y: 0 },
      size: { x: 1000, y: 400 }, // Deep floor
      color: COLORS.GROUND_TOP,
      health: 999,
      active: true,
      facing: 1
    });

    // Procedural chunks
    let currentX = 800;
    for (let i = 0; i < 50; i++) {
      const gap = Math.random() > 0.8;
      const heightVar = Math.random() > 0.5 ? -60 : 0;
      const width = 200 + Math.random() * 400;
      
      if (!gap) {
        platforms.push({
          id: `floor-${i+1}`,
          type: EntityType.PLATFORM,
          pos: { x: currentX, y: floorY + heightVar },
          vel: { x: 0, y: 0 },
          size: { x: width, y: 400 },
          color: COLORS.GROUND_TOP,
          health: 999,
          active: true,
          facing: 1
        });
        
        // Add floating platforms
        if (Math.random() > 0.5) {
           platforms.push({
            id: `plat-${i}`,
            type: EntityType.PLATFORM,
            pos: { x: currentX + 50, y: floorY - 120 },
            vel: { x: 0, y: 0 },
            size: { x: 100, y: 20 },
            color: COLORS.GROUND_TOP,
            health: 999,
            active: true,
            facing: 1
          });
        }
      }
      
      currentX += width + (gap ? 100 : 0);
    }
    
    entitiesRef.current = platforms;
  }, []);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': inputRef.current.left = true; break;
        case 'ArrowRight': case 'KeyD': inputRef.current.right = true; break;
        case 'ArrowUp': case 'KeyW': inputRef.current.up = true; break;
        case 'ArrowDown': case 'KeyS': inputRef.current.down = true; break;
        case 'Space': case 'KeyK': case 'KeyZ': 
          if (!inputRef.current.jump) inputRef.current.jump = true; 
          break;
        case 'KeyJ': case 'KeyX': case 'Enter': inputRef.current.shoot = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': inputRef.current.left = false; break;
        case 'ArrowRight': case 'KeyD': inputRef.current.right = false; break;
        case 'ArrowUp': case 'KeyW': inputRef.current.up = false; break;
        case 'ArrowDown': case 'KeyS': inputRef.current.down = false; break;
        case 'Space': case 'KeyK': case 'KeyZ': inputRef.current.jump = false; break;
        case 'KeyJ': case 'KeyX': case 'Enter': inputRef.current.shoot = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Initial Setup
    generateLevel();
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(requestRef.current!);
    };
  }, [generateLevel]);

  // Main Loop
  const update = useCallback(() => {
    if (hudState.gameOver) return;

    frameCountRef.current++;
    const player = playerRef.current;
    const input = inputRef.current;
    
    // --- Player Logic ---
    if (input.left) {
      player.vel.x = -PLAYER_SPEED;
      player.facing = -1;
      player.state = 'run';
    } else if (input.right) {
      player.vel.x = PLAYER_SPEED;
      player.facing = 1;
      player.state = 'run';
    } else {
      player.vel.x = 0;
      player.state = 'idle';
    }
    
    // Duck
    if (input.down && player.grounded) {
        player.vel.x = 0;
        player.size.y = SIZES.PLAYER.y / 2;
        player.pos.y += SIZES.PLAYER.y / 2; // Visually shift down (corrected in draw)
        player.state = 'duck';
    } else {
        player.size.y = SIZES.PLAYER.y;
    }

    // Jump
    if (input.jump && player.grounded) {
      player.vel.y = -JUMP_FORCE;
      player.grounded = false;
      player.state = 'jump';
    }
    
    // Shooting
    if (input.shoot && (player.cooldown || 0) <= 0) {
      const bX = player.facing === 1 ? player.pos.x + player.size.x : player.pos.x - 10;
      const bY = input.down ? player.pos.y + 10 : player.pos.y + 12; // Lower if ducking
      
      // Multi-directional shooting support
      let vx = player.facing * BULLET_SPEED;
      let vy = 0;
      if (input.up) {
         vy = -BULLET_SPEED;
         vx = input.right || input.left ? vx * 0.7 : 0;
         vy = input.right || input.left ? vy * 0.7 : -BULLET_SPEED;
      }

      entitiesRef.current.push({
        id: `bullet-${Math.random()}`,
        type: EntityType.BULLET_PLAYER,
        pos: { x: bX, y: bY },
        vel: { x: vx, y: vy },
        size: { ...SIZES.BULLET },
        color: COLORS.BULLET_PLAYER,
        health: 1,
        active: true,
        facing: player.facing
      });
      player.cooldown = 10;
    }
    if (player.cooldown && player.cooldown > 0) player.cooldown--;

    // Gravity
    player.vel.y += GRAVITY;
    player.pos.x += player.vel.x;
    player.pos.y += player.vel.y;
    
    // Fall off world
    if (player.pos.y > CANVAS_HEIGHT + 100) {
      handlePlayerDeath();
    }

    // --- Entity Logic ---
    
    // Spawn Enemies
    if (frameCountRef.current % SPAWN_RATE === 0) {
       const spawnX = cameraRef.current.x + CANVAS_WIDTH + 50;
       // Runner
       entitiesRef.current.push({
         id: `enemy-${Math.random()}`,
         type: EntityType.ENEMY_RUNNER,
         pos: { x: spawnX, y: 0 }, // Y corrected by gravity
         vel: { x: -ENEMY_SPEED, y: 0 },
         size: { ...SIZES.ENEMY_RUNNER },
         color: COLORS.ENEMY_UNIFORM,
         health: 1,
         active: true,
         facing: -1,
         grounded: false
       });
    }

    entitiesRef.current.forEach(entity => {
      if (!entity.active) return;
      
      // Physics for dynamic entities
      if (entity.type === EntityType.ENEMY_RUNNER || entity.type === EntityType.PARTICLE) {
        entity.vel.y += GRAVITY;
        entity.pos.x += entity.vel.x;
        entity.pos.y += entity.vel.y;
      }
      
      if (entity.type === EntityType.BULLET_PLAYER || entity.type === EntityType.BULLET_ENEMY) {
        entity.pos.x += entity.vel.x;
        entity.pos.y += entity.vel.y;
        // Cleanup bullets
        if (Math.abs(entity.pos.x - cameraRef.current.x) > CANVAS_WIDTH * 1.5) entity.active = false;
      }
      
      // Enemy Logic
      if (entity.type === EntityType.ENEMY_RUNNER) {
        // Simple follow logic if close
        if (player.pos.x < entity.pos.x) entity.vel.x = -ENEMY_SPEED;
        else entity.vel.x = ENEMY_SPEED;
        
        // Random Shoot
        if (Math.random() < 0.01) {
           const dir = player.pos.x < entity.pos.x ? -1 : 1;
           entitiesRef.current.push({
             id: `ebullet-${Math.random()}`,
             type: EntityType.BULLET_ENEMY,
             pos: { x: entity.pos.x, y: entity.pos.y + 10 },
             vel: { x: dir * (BULLET_SPEED * 0.6), y: 0 },
             size: { ...SIZES.BULLET },
             color: COLORS.BULLET_ENEMY,
             health: 1,
             active: true,
             facing: dir
           });
        }
      }
    });

    // --- Collision Detection ---
    
    player.grounded = false;
    
    // Player vs Platforms
    checkPlatformCollisions(player, entitiesRef.current);
    
    // Enemies vs Platforms
    entitiesRef.current.forEach(entity => {
      if (entity.type === EntityType.ENEMY_RUNNER) {
        entity.grounded = false;
        checkPlatformCollisions(entity, entitiesRef.current);
      }
    });
    
    // Bullets vs Enemies / Player vs Enemies
    entitiesRef.current.forEach(entity => {
      if (!entity.active) return;
      
      // Bullets hitting Enemies
      if (entity.type === EntityType.BULLET_PLAYER) {
        entitiesRef.current.forEach(target => {
          if (target.active && (target.type === EntityType.ENEMY_RUNNER || target.type === EntityType.ENEMY_TURRET)) {
            if (checkRectOverlap(entity, target)) {
               entity.active = false;
               target.health--;
               if (target.health <= 0) {
                 target.active = false;
                 spawnExplosion(target.pos);
                 setHudState(prev => ({ ...prev, score: prev.score + 100 }));
               }
            }
          }
        });
      }
      
      // Bullets hitting Player
      if (entity.type === EntityType.BULLET_ENEMY || (entity.type === EntityType.ENEMY_RUNNER)) {
        if (checkRectOverlap(entity, player)) {
           if (entity.type === EntityType.BULLET_ENEMY) entity.active = false;
           handlePlayerDeath();
        }
      }
    });

    // Cleanup inactive
    entitiesRef.current = entitiesRef.current.filter(e => e.active);
    
    // Camera Follow
    const targetCamX = player.pos.x - CANVAS_WIDTH / 3;
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;
    
    // Clamp Camera (can't go left)
    if (cameraRef.current.x < 0) cameraRef.current.x = 0;

  }, [hudState.gameOver]);

  const handlePlayerDeath = () => {
    const player = playerRef.current;
    spawnExplosion(player.pos, 20);
    
    // Respawn logic
    setHudState(prev => {
      const newLives = prev.lives - 1;
      if (newLives <= 0) {
        return { ...prev, lives: 0, gameOver: true };
      }
      // Reset player pos
      playerRef.current.pos = { x: cameraRef.current.x + 100, y: 100 };
      playerRef.current.vel = { x: 0, y: 0 };
      return { ...prev, lives: newLives };
    });
  };

  const spawnExplosion = (pos: Vector2, count = 5) => {
    for(let i=0; i<count; i++) {
      entitiesRef.current.push({
        id: `part-${Math.random()}`,
        type: EntityType.PARTICLE,
        pos: { ...pos },
        vel: { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10 },
        size: { x: 4, y: 4 },
        color: Math.random() > 0.5 ? '#ffaa00' : '#ffffff',
        health: 20 + Math.random() * 20, // Used as lifetime frames
        active: true,
        facing: 1
      });
    }
  };

  const checkPlatformCollisions = (actor: GameObject, others: GameObject[]) => {
    others.forEach(platform => {
      if (platform.type === EntityType.PLATFORM) {
        // Check AABB
        if (
          actor.pos.x < platform.pos.x + platform.size.x &&
          actor.pos.x + actor.size.x > platform.pos.x &&
          actor.pos.y < platform.pos.y + platform.size.y &&
          actor.pos.y + actor.size.y > platform.pos.y
        ) {
          // Collision detected. 
          // Simple resolution: if we were above it before this frame, we landed.
          const prevY = actor.pos.y - actor.vel.y;
          if (prevY + actor.size.y <= platform.pos.y + 5) { // +5 tolerance
             actor.pos.y = platform.pos.y - actor.size.y;
             actor.vel.y = 0;
             actor.grounded = true;
          }
        }
      }
    });
  };

  const checkRectOverlap = (r1: GameObject, r2: GameObject) => {
    return (
      r1.pos.x < r2.pos.x + r2.size.x &&
      r1.pos.x + r1.size.x > r2.pos.x &&
      r1.pos.y < r2.pos.y + r2.size.y &&
      r1.pos.y + r1.size.y > r2.pos.y
    );
  };

  // Rendering Loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const cam = cameraRef.current;
    const player = playerRef.current;

    // Clear
    ctx.fillStyle = COLORS.SKY;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw Environment
    entitiesRef.current.forEach(e => {
      if (!e.active) return;
      const screenX = e.pos.x - cam.x;
      
      if (e.type === EntityType.PLATFORM) {
        ctx.fillStyle = e.color;
        ctx.fillRect(screenX, e.pos.y, e.size.x, e.size.y);
        // Detail: lighter top strip
        ctx.fillStyle = '#66cc66';
        ctx.fillRect(screenX, e.pos.y, e.size.x, 4);
      }
    });

    // Draw Entities (Player, Enemies, Bullets)
    const drawActor = (actor: GameObject) => {
       const sx = actor.pos.x - cam.x;
       
       if (actor.type === EntityType.PLAYER) {
         // Pants
         ctx.fillStyle = COLORS.PLAYER_PANTS;
         ctx.fillRect(sx, actor.pos.y + 24, 24, 24);
         // Skin
         ctx.fillStyle = COLORS.PLAYER_SKIN;
         ctx.fillRect(sx, actor.pos.y, 24, 24);
         // Bandana
         ctx.fillStyle = COLORS.PLAYER_BANDANA;
         ctx.fillRect(sx, actor.pos.y + 2, 24, 6);
         // Gun
         ctx.fillStyle = '#333';
         if (actor.facing === 1) ctx.fillRect(sx + 12, actor.pos.y + 12, 20, 8);
         else ctx.fillRect(sx - 8, actor.pos.y + 12, 20, 8);
         
         // Ducking squish logic visually
         if (actor.state === 'duck') {
           // handled by size.y logic in update, but we can refine visuals here if needed
         }
       } else if (actor.type === EntityType.ENEMY_RUNNER) {
         ctx.fillStyle = COLORS.ENEMY_UNIFORM;
         ctx.fillRect(sx, actor.pos.y, 24, 48);
         // Red eye/visor
         ctx.fillStyle = '#f00';
         if (actor.facing === 1) ctx.fillRect(sx+16, actor.pos.y+10, 6, 4);
         else ctx.fillRect(sx+2, actor.pos.y+10, 6, 4);
       } else if (actor.type === EntityType.BULLET_PLAYER || actor.type === EntityType.BULLET_ENEMY) {
         ctx.fillStyle = actor.color;
         ctx.beginPath();
         ctx.arc(sx + 3, actor.pos.y + 3, 4, 0, Math.PI * 2);
         ctx.fill();
       } else if (actor.type === EntityType.PARTICLE) {
         ctx.fillStyle = actor.color;
         ctx.globalAlpha = (actor.health / 40);
         ctx.fillRect(sx, actor.pos.y, actor.size.x, actor.size.y);
         ctx.globalAlpha = 1.0;
         actor.health--;
         if (actor.health <= 0) actor.active = false;
       }
    };

    drawActor(player);
    entitiesRef.current.forEach(e => {
        if (e.type !== EntityType.PLATFORM) drawActor(e);
    });

  }, []);

  const gameLoop = useCallback(() => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [update, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameLoop]);

  // Handle Game Over
  useEffect(() => {
    if (hudState.gameOver) {
        onGameOver(hudState.score);
        // Save high score
        if (hudState.score > hudState.highScore) {
           localStorage.setItem('contra_highscore', hudState.score.toString());
        }
    }
  }, [hudState.gameOver, hudState.score, hudState.highScore, onGameOver]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-zinc-900">
      <div className="relative border-8 border-zinc-800 rounded-lg shadow-2xl overflow-hidden bg-black"
           style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-full"
        />
        
        {/* Retro Effects */}
        <div className="scanlines"></div>
        <div className="crt-flicker"></div>

        {/* HUD */}
        <div className="absolute top-4 left-4 text-white font-mono text-xl z-20 flex gap-8">
           <div className="text-yellow-400 drop-shadow-md">SCORE: {hudState.score.toString().padStart(6, '0')}</div>
           <div className="text-red-400 drop-shadow-md">LIVES: {hudState.lives}</div>
           <div className="text-gray-400 drop-shadow-md">HI: {hudState.highScore.toString().padStart(6, '0')}</div>
        </div>
        
        {/* Mobile Controls Overlay */}
        <div className="absolute bottom-4 left-4 flex gap-2 z-30 md:hidden">
            <button 
                className="w-16 h-16 bg-white/20 rounded-full active:bg-white/40 border border-white/50 text-white font-bold"
                onTouchStart={() => inputRef.current.left = true}
                onTouchEnd={() => inputRef.current.left = false}
            >←</button>
             <button 
                className="w-16 h-16 bg-white/20 rounded-full active:bg-white/40 border border-white/50 text-white font-bold"
                onTouchStart={() => inputRef.current.right = true}
                onTouchEnd={() => inputRef.current.right = false}
            >→</button>
        </div>
        <div className="absolute bottom-4 right-4 flex gap-4 z-30 md:hidden">
            <button 
                className="w-20 h-20 bg-red-500/40 rounded-full active:bg-red-500/60 border-2 border-red-300 text-white font-bold text-xs"
                onTouchStart={() => inputRef.current.shoot = true}
                onTouchEnd={() => inputRef.current.shoot = false}
            >SHOOT</button>
            <button 
                className="w-20 h-20 bg-blue-500/40 rounded-full active:bg-blue-500/60 border-2 border-blue-300 text-white font-bold text-xs"
                onTouchStart={() => inputRef.current.jump = true}
                onTouchEnd={() => inputRef.current.jump = false}
            >JUMP</button>
        </div>
        
        {/* Mobile Duck (Bottom Center) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 md:hidden">
             <button 
                className="w-16 h-12 bg-white/20 rounded active:bg-white/40 border border-white/50 text-white font-bold text-xs"
                onTouchStart={() => inputRef.current.down = true}
                onTouchEnd={() => inputRef.current.down = false}
            >↓</button>
        </div>
      </div>
    </div>
  );
};

export default GameEngine;