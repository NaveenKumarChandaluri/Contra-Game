import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EntityType, GameObject, GameState, InputState, Vector2, WeaponType } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, PLAYER_SPEED, JUMP_FORCE, BULLET_SPEED, ENEMY_SPEED, SPAWN_RATE, COLORS, SIZES } from '../constants';

interface GameEngineProps {
  onGameOver: (score: number) => void;
  onExit: () => void;
}

const checkRectOverlap = (a: GameObject, b: GameObject) => {
  return (
    a.pos.x < b.pos.x + b.size.x &&
    a.pos.x + a.size.x > b.pos.x &&
    a.pos.y < b.pos.y + b.size.y &&
    a.pos.y + a.size.y > b.pos.y
  );
};

const GameEngine: React.FC<GameEngineProps> = ({ onGameOver, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Game State Refs
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
    state: 'idle',
    weaponType: WeaponType.NORMAL,
    angle: 0
  });
  
  const entitiesRef = useRef<GameObject[]>([]);
  const inputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false, jump: false, shoot: false
  });
  
  const [hudState, setHudState] = useState<GameState>({
    score: 0,
    lives: 3,
    gameOver: false,
    gameWon: false,
    highScore: parseInt(localStorage.getItem('contra_highscore') || '0', 10),
  });

  const spawnExplosion = useCallback((pos: Vector2) => {
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const speed = 2 + Math.random();
        entitiesRef.current.push({
            id: `exp-${Math.random()}`,
            type: EntityType.PARTICLE,
            pos: { ...pos },
            vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            size: { x: 4, y: 4 },
            color: '#ffaa00',
            health: 20, // Frames to live
            active: true,
            facing: 1
        });
    }
  }, []);

  const handlePlayerDeath = useCallback(() => {
    const player = playerRef.current;
    if (!player.active) return;
    
    player.active = false;
    spawnExplosion(player.pos);
    
    setHudState(prev => {
        const newLives = prev.lives - 1;
        if (newLives < 0) {
            onGameOver(prev.score);
            return { ...prev, lives: newLives, gameOver: true };
        }
        
        // Respawn logic
        setTimeout(() => {
            player.active = true;
            player.health = 1;
            player.pos = { x: cameraRef.current.x + 100, y: 50 };
            player.vel = { x: 0, y: 0 };
            player.weaponType = WeaponType.NORMAL; // Lose weapon
        }, 1000);
        
        return { ...prev, lives: newLives };
    });
  }, [onGameOver, spawnExplosion]);

  const checkPlatformCollisions = useCallback((entity: GameObject, others: GameObject[]) => {
      // Simple AABB vs Platform one-way collision
      // Only collide if falling and feet were above platform
      if (entity.vel.y < 0) return; // Moving up, ignore

      const feetY = entity.pos.y + entity.size.y;
      const prevFeetY = feetY - entity.vel.y;

      for (const other of others) {
          if ((other.type === EntityType.PLATFORM || other.type === EntityType.BRIDGE) && other.active) {
              if (
                  entity.pos.x + entity.size.x > other.pos.x &&
                  entity.pos.x < other.pos.x + other.size.x
              ) {
                  // Horizontal overlap
                  if (feetY >= other.pos.y && prevFeetY <= other.pos.y) {
                      // Landed
                      entity.pos.y = other.pos.y - entity.size.y;
                      entity.vel.y = 0;
                      entity.grounded = true;
                      return; // Collided with one is enough
                  }
              }
          }
      }
  }, []);

  // Level Generation (Jungle Theme)
  const generateLevel = useCallback(() => {
    const ents: GameObject[] = [];
    const floorY = CANVAS_HEIGHT - 60;
    
    // Water Base (Kill zone but visual)
    ents.push({
      id: 'water-base',
      type: EntityType.WATER,
      pos: { x: -500, y: floorY + 30 },
      vel: { x: 0, y: 0 },
      size: { x: 10000, y: 100 },
      color: COLORS.WATER_SURFACE,
      health: 999,
      active: true,
      facing: 1
    });

    let currentX = 0;
    
    // Chunk generation logic
    for (let i = 0; i < 40; i++) {
      const isBridge = i > 10 && i < 15; // Bridge section
      const isGap = !isBridge && Math.random() > 0.8;
      const heightLevel = (!isBridge && Math.random() > 0.6) ? 100 : 0; // Elevated platforms
      const width = isBridge ? 64 : 128 + Math.random() * 200;
      
      if (!isGap) {
        // Ground block
        ents.push({
          id: `floor-${i}`,
          type: EntityType.PLATFORM,
          pos: { x: currentX, y: floorY - heightLevel },
          vel: { x: 0, y: 0 },
          size: { x: width, y: 100 + heightLevel },
          color: isBridge ? COLORS.BRIDGE : COLORS.GROUND_TOP,
          health: 999,
          active: true,
          facing: 1,
          isBridge: isBridge
        });

        // Add Turrets on ground
        if (!isBridge && Math.random() > 0.7 && i > 3) {
          ents.push({
            id: `turret-${i}`,
            type: EntityType.ENEMY_TURRET,
            pos: { x: currentX + width / 2, y: floorY - heightLevel - 32 },
            vel: { x: 0, y: 0 },
            size: { ...SIZES.ENEMY_TURRET },
            color: COLORS.TURRET_BASE,
            health: 3,
            active: true,
            facing: -1
          });
        }
      } else {
        // Water is visible in gap
        // Add floating platform in gap sometimes
        if (Math.random() > 0.4) {
           ents.push({
            id: `plat-float-${i}`,
            type: EntityType.PLATFORM,
            pos: { x: currentX + 50, y: floorY - 80 },
            vel: { x: 0, y: 0 },
            size: { x: 80, y: 20 },
            color: COLORS.GROUND_TOP,
            health: 999,
            active: true,
            facing: 1
          });
        }
      }
      
      // Flying Powerup Capsule Spawn Point
      if (i === 8 || i === 20) {
        ents.push({
          id: `powerup-${i}`,
          type: EntityType.POWERUP_CAPSULE,
          pos: { x: currentX, y: 100 },
          vel: { x: 2, y: 1 }, // Floating logic handled in update
          size: { ...SIZES.POWERUP },
          color: '#aa0000',
          health: 1,
          active: true,
          facing: 1
        });
      }

      currentX += width + (isGap ? 100 : 0);
    }
    
    // Boss Wall
    ents.push({
        id: 'boss-wall',
        type: EntityType.PLATFORM,
        pos: { x: currentX, y: 0 },
        vel: { x: 0, y: 0 },
        size: { x: 100, y: CANVAS_HEIGHT },
        color: '#500',
        health: 999,
        active: true,
        facing: 1
    });

    entitiesRef.current = ents;
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
    generateLevel();
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(requestRef.current!);
    };
  }, [generateLevel]);

  // Main Logic
  const update = useCallback(() => {
    if (hudState.gameOver) return;
    frameCountRef.current++;
    const player = playerRef.current;
    const input = inputRef.current;
    
    // --- Player Movement ---
    if (input.left) {
      player.vel.x = -PLAYER_SPEED;
      player.facing = -1;
      if (player.grounded) player.state = 'run';
    } else if (input.right) {
      player.vel.x = PLAYER_SPEED;
      player.facing = 1;
      if (player.grounded) player.state = 'run';
    } else {
      player.vel.x = 0;
      if (player.grounded) player.state = 'idle';
    }
    
    // Ducking
    if (input.down) {
       if (player.grounded) {
         player.vel.x = 0;
         player.state = 'duck';
         player.size.y = 22; // Duck height
         player.pos.y += 22; // Visual adjust
       }
    } else {
       if (player.size.y === 22) { // Stand up
         player.size.y = SIZES.PLAYER.y;
         player.pos.y -= 22;
       }
    }

    // Jumping (Somersault)
    if (input.jump && player.grounded) {
      player.vel.y = -JUMP_FORCE;
      player.grounded = false;
      player.state = 'jump';
    }

    if (!player.grounded) {
      player.state = 'jump';
      player.angle = (player.angle || 0) + 0.5 * player.facing; // Spin
    } else {
      player.angle = 0;
    }

    // Gravity
    player.vel.y += GRAVITY;
    player.pos.x += player.vel.x;
    player.pos.y += player.vel.y;

    // --- Shooting ---
    if (input.shoot && (player.cooldown || 0) <= 0) {
      const spread = player.weaponType === WeaponType.SPREAD;
      const bSpeed = BULLET_SPEED;
      
      // Determine shoot direction based on input
      // Explicitly type dirX as number so it can hold 0
      let dirX: number = player.facing;
      let dirY = 0;

      if (input.up) {
         if (input.right || input.left) { dirY = -0.7; dirX = player.facing * 0.7; }
         else { dirY = -1; dirX = 0; }
      } else if (input.down && !player.grounded) { // Shoot down only in air
         if (input.right || input.left) { dirY = 0.7; dirX = player.facing * 0.7; }
         else { dirY = 1; dirX = 0; }
      }

      const spawnBullet = (vx: number, vy: number) => {
        entitiesRef.current.push({
          id: `pbul-${Math.random()}`,
          type: EntityType.BULLET_PLAYER,
          pos: { 
            x: player.pos.x + player.size.x/2, 
            y: player.pos.y + (input.down && player.grounded ? 16 : 8) 
          },
          vel: { x: vx, y: vy },
          size: spread ? { ...SIZES.SPREAD_BULLET } : { ...SIZES.BULLET },
          color: COLORS.BULLET_PLAYER,
          health: 1,
          active: true,
          facing: player.facing
        });
      };

      spawnBullet(dirX * bSpeed, dirY * bSpeed);

      if (spread) {
        // Add 2 more bullets angled slightly
        const angle = Math.atan2(dirY, dirX);
        const a1 = angle + 0.25;
        const a2 = angle - 0.25;
        spawnBullet(Math.cos(a1) * bSpeed, Math.sin(a1) * bSpeed);
        spawnBullet(Math.cos(a2) * bSpeed, Math.sin(a2) * bSpeed);
        spawnBullet(Math.cos(a1 + 0.25) * bSpeed, Math.sin(a1 + 0.25) * bSpeed);
        spawnBullet(Math.cos(a2 - 0.25) * bSpeed, Math.sin(a2 - 0.25) * bSpeed);
      }

      player.cooldown = spread ? 8 : 6;
    }
    if (player.cooldown && player.cooldown > 0) player.cooldown--;

    // --- Entities ---
    
    // Spawning
    if (frameCountRef.current % SPAWN_RATE === 0) {
      const spawnX = cameraRef.current.x + CANVAS_WIDTH + 50;
      entitiesRef.current.push({
        id: `runner-${Math.random()}`,
        type: EntityType.ENEMY_RUNNER,
        pos: { x: spawnX, y: 0 },
        vel: { x: -ENEMY_SPEED, y: 0 },
        size: { ...SIZES.ENEMY_RUNNER },
        color: COLORS.ENEMY_UNIFORM,
        health: 1,
        active: true,
        facing: -1,
        grounded: false
      });
    }

    entitiesRef.current.forEach(e => {
      if (!e.active) return;
      
      // Physics
      if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.PARTICLE) {
        e.vel.y += GRAVITY;
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      }
      if (e.type === EntityType.BULLET_PLAYER || e.type === EntityType.BULLET_ENEMY) {
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
        if (frameCountRef.current % 5 === 0 && e.type === EntityType.BULLET_PLAYER) {
           e.color = e.color === '#ffffff' ? '#ffaa00' : '#ffffff'; // Pulse
        }
      }
      
      // Powerup Motion (Sin wave)
      if (e.type === EntityType.POWERUP_CAPSULE) {
        e.pos.x += Math.sin(frameCountRef.current / 20) * 2;
        e.pos.y += Math.cos(frameCountRef.current / 20);
      }
      
      // Turret AI
      if (e.type === EntityType.ENEMY_TURRET) {
        if (Math.abs(e.pos.x - player.pos.x) < 300 && frameCountRef.current % 100 === 0) {
          // Aim at player
          const dx = player.pos.x - e.pos.x;
          const dy = player.pos.y - e.pos.y;
          const angle = Math.atan2(dy, dx);
          entitiesRef.current.push({
             id: `ebul-${Math.random()}`,
             type: EntityType.BULLET_ENEMY,
             pos: { x: e.pos.x + 16, y: e.pos.y + 16 },
             vel: { x: Math.cos(angle) * (BULLET_SPEED/2), y: Math.sin(angle) * (BULLET_SPEED/2) },
             size: { ...SIZES.BULLET },
             color: COLORS.BULLET_ENEMY,
             health: 1,
             active: true,
             facing: dx > 0 ? 1 : -1
          });
        }
      }
      
      if (e.type === EntityType.PARTICLE) {
          e.health--;
          if (e.health <= 0) e.active = false;
      }
    });

    // --- Collisions ---
    
    // 1. World Collision (Platforms)
    player.grounded = false;
    checkPlatformCollisions(player, entitiesRef.current);
    
    entitiesRef.current.forEach(e => {
      if (e.type === EntityType.ENEMY_RUNNER) {
        e.grounded = false;
        checkPlatformCollisions(e, entitiesRef.current);
      }
    });
    
    // 2. Interaction Collision
    entitiesRef.current.forEach(e => {
       if (!e.active) return;
       
       // Player Bullets vs Enemies
       if (e.type === EntityType.BULLET_PLAYER) {
         entitiesRef.current.forEach(target => {
            if (!target.active) return;
            if (target.type === EntityType.ENEMY_RUNNER || target.type === EntityType.ENEMY_TURRET || target.type === EntityType.POWERUP_CAPSULE) {
              if (checkRectOverlap(e, target)) {
                e.active = false;
                target.health--;
                if (target.health <= 0) {
                   target.active = false;
                   spawnExplosion(target.pos);
                   
                   // Drop powerup?
                   if (target.type === EntityType.POWERUP_CAPSULE) {
                      player.weaponType = WeaponType.SPREAD;
                      // Floating S text
                      entitiesRef.current.push({
                        id: `float-S-${Math.random()}`,
                        type: EntityType.PARTICLE,
                        pos: { ...target.pos },
                        vel: { x: 0, y: -1 },
                        size: { x: 10, y: 10 },
                        color: '#ff0000',
                        health: 30,
                        active: true,
                        facing: 1
                      });
                   } else {
                      setHudState(prev => ({ ...prev, score: prev.score + 100 }));
                   }
                }
              }
            }
         });
       }
       
       // Enemy/Bullets vs Player
       if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.BULLET_ENEMY) {
          if (checkRectOverlap(e, player)) {
             handlePlayerDeath();
          }
       }
       
       // Water Death
       if (e.type === EntityType.WATER && checkRectOverlap(player, e)) {
          handlePlayerDeath();
       }
    });
    
    // Camera
    const targetX = player.pos.x - CANVAS_WIDTH / 3;
    if (targetX > cameraRef.current.x) {
      cameraRef.current.x = targetX; // Move forward only
    }
    
    // Cleanup
    entitiesRef.current = entitiesRef.current.filter(e => {
        const inView = e.pos.x > cameraRef.current.x - 100 && e.pos.x < cameraRef.current.x + CANVAS_WIDTH + 100;
        return e.active && (e.type === EntityType.PLATFORM || e.type === EntityType.WATER ? true : inView);
    });
    
  }, [hudState.gameOver, spawnExplosion, handlePlayerDeath, checkPlatformCollisions]);

  const draw = useCallback(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     
     // Clear
     ctx.fillStyle = COLORS.SKY;
     ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
     
     ctx.save();
     ctx.translate(-Math.floor(cameraRef.current.x), 0);
     
     // Draw Entities
     entitiesRef.current.forEach(e => {
         if (!e.active) return;
         ctx.fillStyle = e.color;
         
         if (e.type === EntityType.WATER) {
             ctx.globalAlpha = 0.6;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             ctx.globalAlpha = 1.0;
         } else if (e.type === EntityType.ENEMY_TURRET) {
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             // Gun
             ctx.fillStyle = COLORS.TURRET_GUN;
             ctx.save();
             ctx.translate(e.pos.x + e.size.x/2, e.pos.y + e.size.y/2);
             // Aim at player logic again for visual? Or just store angle?
             // Simplification: just draw box
             ctx.fillRect(-4, -10, 8, 20);
             ctx.restore();
         } else {
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
         }
     });
     
     // Draw Player
     const p = playerRef.current;
     if (p.active) {
         ctx.save();
         ctx.translate(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2);
         if (p.state === 'jump') {
             ctx.rotate(p.angle || 0);
         }
         ctx.scale(p.facing, 1);
         
         // Body
         ctx.fillStyle = p.color; // Pants
         ctx.fillRect(-p.size.x/2, 0, p.size.x, p.size.y/2);
         ctx.fillStyle = COLORS.PLAYER_SKIN; // Skin
         ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, p.size.y/2);
         ctx.fillStyle = COLORS.PLAYER_BANDANA; // Bandana
         ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, 6);
         
         // Gun
         ctx.fillStyle = '#ccc';
         ctx.fillRect(0, -4, 20, 8);
         
         ctx.restore();
     }
     
     ctx.restore();
     
     // HUD
     ctx.fillStyle = COLORS.HUD_TEXT;
     ctx.font = '16px monospace';
     ctx.fillText(`P1 SCORE: ${hudState.score}`, 10, 20);
     ctx.fillText(`LIVES: ${hudState.lives}`, 10, 40);
     ctx.fillText(`HI: ${hudState.highScore}`, 200, 20);
     
     if (hudState.gameOver) {
         ctx.fillStyle = 'rgba(0,0,0,0.7)';
         ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
         ctx.fillStyle = '#fff';
         ctx.font = '30px monospace';
         ctx.fillText('GAME OVER', CANVAS_WIDTH/2 - 80, CANVAS_HEIGHT/2);
     }
     
  }, [hudState]);

  const loop = useCallback(() => {
     update();
     draw();
     requestRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
     requestRef.current = requestAnimationFrame(loop);
     return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT}
            className="w-full h-full object-contain image-pixelated"
            style={{ imageRendering: 'pixelated' }}
        />
    </div>
  );
};

export default GameEngine;