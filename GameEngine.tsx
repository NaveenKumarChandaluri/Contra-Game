import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EntityType, GameObject, GameState, InputState, Vector2, WeaponType } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, PLAYER_SPEED, JUMP_FORCE, BULLET_SPEED, ENEMY_SPEED, SPAWN_RATE, COLORS, SIZES } from '../constants';

interface GameEngineProps {
  onGameOver: (score: number) => void;
  onExit: () => void;
}

// Helper for collision detection
const checkRectOverlap = (a: GameObject, b: GameObject) => {
  return (
    a.pos.x < b.pos.x + b.size.x &&
    a.pos.x + a.size.x > b.pos.x &&
    a.pos.y < b.pos.y + b.size.y &&
    a.pos.y + a.size.y > b.pos.y
  );
};

const GameEngine: React.FC<GameEngineProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Game State Refs (Mutable for performance in loop)
  const cameraRef = useRef<Vector2>({ x: 0, y: 0 });
  const gameStateRef = useRef<GameState>({
    score: 0,
    lives: 3,
    gameOver: false,
    gameWon: false,
    highScore: parseInt(localStorage.getItem('contra_highscore') || '0', 10),
  });

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
    left: false, right: false, up: false, down: false, jump: false, shoot: false, altFire: false
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
    
    // Decrement lives
    gameStateRef.current.lives -= 1;
    
    if (gameStateRef.current.lives < 0) {
        gameStateRef.current.gameOver = true;
        onGameOver(gameStateRef.current.score);
    } else {
        // Respawn logic
        setTimeout(() => {
            if (gameStateRef.current.gameOver) return;
            player.active = true;
            player.health = 1;
            player.pos = { x: cameraRef.current.x + 100, y: 50 };
            player.vel = { x: 0, y: 0 };
            player.weaponType = WeaponType.NORMAL; // Lose weapon
            player.cooldown = 120; // Invincibility frames (reused prop)
        }, 1500);
    }
  }, [onGameOver, spawnExplosion]);

  const checkPlatformCollisions = useCallback((entity: GameObject, others: GameObject[]) => {
      // Simple AABB vs Platform one-way collision
      if (entity.vel.y < 0) return; // Moving up, ignore

      const feetY = entity.pos.y + entity.size.y;
      const prevFeetY = feetY - entity.vel.y;

      for (const other of others) {
          // Fixed: Removed invalid EntityType.BRIDGE, relying on PLATFORM
          if ((other.type === EntityType.PLATFORM) && other.active) {
              // Horizontal overlap
              if (
                  entity.pos.x + entity.size.x > other.pos.x &&
                  entity.pos.x < other.pos.x + other.size.x
              ) {
                  // Was above?
                  if (feetY >= other.pos.y && prevFeetY <= other.pos.y + 1) { // +1 for float tolerance
                      // Landed
                      entity.pos.y = other.pos.y - entity.size.y;
                      entity.vel.y = 0;
                      entity.grounded = true;
                      return; 
                  }
              }
          }
      }
  }, []);

  // Level Generation (Jungle Theme)
  const generateLevel = useCallback(() => {
    const ents: GameObject[] = [];
    const floorY = CANVAS_HEIGHT - 60;
    
    // Water Base
    ents.push({
      id: 'water-base',
      type: EntityType.WATER,
      pos: { x: -500, y: floorY + 30 },
      vel: { x: 0, y: 0 },
      size: { x: 20000, y: 100 },
      color: COLORS.WATER_SURFACE,
      health: 999,
      active: true,
      facing: 1
    });

    let currentX = 0;
    
    // Chunk generation
    for (let i = 0; i < 60; i++) {
      const isBridge = i > 12 && i < 18; 
      const isGap = !isBridge && Math.random() > 0.85;
      const heightLevel = (!isBridge && Math.random() > 0.65) ? 100 : 0; 
      const width = isBridge ? 64 : 128 + Math.random() * 200;
      
      if (!isGap) {
        // Ground
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

        // Turrets
        if (!isBridge && Math.random() > 0.6 && i > 3) {
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
        // Floating platform in gap
        if (Math.random() > 0.3) {
           ents.push({
            id: `plat-float-${i}`,
            type: EntityType.PLATFORM,
            pos: { x: currentX + 40, y: floorY - 80 },
            vel: { x: 0, y: 0 },
            size: { x: 90, y: 20 },
            color: COLORS.GROUND_TOP,
            health: 999,
            active: true,
            facing: 1
          });
        }
      }
      
      // Powerups
      if (i === 8 || i === 25 || i === 45) {
        ents.push({
          id: `powerup-${i}`,
          type: EntityType.POWERUP_CAPSULE,
          pos: { x: currentX, y: 100 },
          vel: { x: 0, y: 0 }, 
          size: { ...SIZES.POWERUP },
          color: '#aa0000',
          health: 1,
          active: true,
          facing: 1
        });
      }

      currentX += width + (isGap ? 80 : 0);
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

  // Input Listeners
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
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [generateLevel]);

  // Main Game Loop Update
  const update = useCallback(() => {
    if (gameStateRef.current.gameOver) return;
    
    frameCountRef.current++;
    const player = playerRef.current;
    const input = inputRef.current;
    
    // --- Player Movement ---
    if (player.active) {
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
             player.size.y = 22; 
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
          player.angle = (player.angle || 0) + 0.4 * player.facing; // Spin
        } else {
          player.angle = 0;
        }

        // Gravity
        player.vel.y += GRAVITY;
        player.pos.x += player.vel.x;
        player.pos.y += player.vel.y;
        
        // Limit max fall speed
        if (player.vel.y > 12) player.vel.y = 12;

        // --- Shooting ---
        if (input.shoot && (player.cooldown || 0) <= 0) {
          const spread = player.weaponType === WeaponType.SPREAD;
          const bSpeed = BULLET_SPEED;
          
          // Fixed: Explicit type annotation for dirX
          let dirX: number = player.facing;
          let dirY = 0;

          if (input.up) {
             if (input.right || input.left) { dirY = -0.7; dirX = player.facing * 0.7; }
             else { dirY = -1; dirX = 0; }
          } else if (input.down && !player.grounded) { 
             if (input.right || input.left) { dirY = 0.7; dirX = player.facing * 0.7; }
             else { dirY = 1; dirX = 0; }
          }

          const spawnBullet = (vx: number, vy: number) => {
            entitiesRef.current.push({
              id: `pbul-${Math.random()}`,
              type: EntityType.BULLET_PLAYER,
              pos: { 
                x: player.pos.x + player.size.x/2 - 4, 
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

          // Center shot
          spawnBullet(dirX * bSpeed, dirY * bSpeed);

          if (spread) {
            // Spread Shot Logic (5 bullets)
            const baseAngle = Math.atan2(dirY, dirX || 0.001); // Avoid atan2(0,0)
            const angles = [baseAngle - 0.2, baseAngle - 0.1, baseAngle + 0.1, baseAngle + 0.2];
            
            angles.forEach(a => {
                spawnBullet(Math.cos(a) * bSpeed, Math.sin(a) * bSpeed);
            });
          }

          player.cooldown = spread ? 10 : 8;
        }
        if (player.cooldown && player.cooldown > 0) player.cooldown--;
    } // End if player active

    // --- Entities Update ---
    
    // Spawning Enemies
    if (frameCountRef.current % SPAWN_RATE === 0 && !gameStateRef.current.gameOver) {
      const spawnX = cameraRef.current.x + CANVAS_WIDTH + 20;
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
      
      // Physics for dynamic entities
      if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.PARTICLE) {
        e.vel.y += GRAVITY;
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      }
      if (e.type === EntityType.BULLET_PLAYER || e.type === EntityType.BULLET_ENEMY) {
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
        // Visual Pulse
        if (frameCountRef.current % 4 === 0 && e.type === EntityType.BULLET_PLAYER) {
           e.color = e.color === '#ffffff' ? '#ffaa00' : '#ffffff';
        }
      }
      
      // Powerup Sine Wave
      if (e.type === EntityType.POWERUP_CAPSULE) {
        e.pos.x += Math.sin(frameCountRef.current / 15) * 2;
        e.pos.y += Math.cos(frameCountRef.current / 15) * 0.5;
      }
      
      // Turret AI
      if (e.type === EntityType.ENEMY_TURRET) {
        const dist = Math.abs(e.pos.x - player.pos.x);
        if (dist < 400 && dist > 20 && frameCountRef.current % 90 === 0 && player.active) {
          // Aim at player center
          const dx = (player.pos.x + player.size.x/2) - (e.pos.x + e.size.x/2);
          const dy = (player.pos.y + player.size.y/2) - (e.pos.y + e.size.y/2);
          const angle = Math.atan2(dy, dx);
          
          entitiesRef.current.push({
             id: `ebul-${Math.random()}`,
             type: EntityType.BULLET_ENEMY,
             pos: { x: e.pos.x + 16, y: e.pos.y + 16 },
             vel: { x: Math.cos(angle) * (BULLET_SPEED * 0.6), y: Math.sin(angle) * (BULLET_SPEED * 0.6) },
             size: { ...SIZES.BULLET },
             color: COLORS.BULLET_ENEMY,
             health: 1,
             active: true,
             facing: dx > 0 ? 1 : -1
          });
        }
      }
      
      // Particle decay
      if (e.type === EntityType.PARTICLE) {
          e.health--;
          if (e.health <= 0) e.active = false;
      }
    });

    // --- Collisions ---
    
    // 1. World Collision (Platforms)
    if (player.active) {
        player.grounded = false;
        checkPlatformCollisions(player, entitiesRef.current);
    }
    
    entitiesRef.current.forEach(e => {
      if (e.type === EntityType.ENEMY_RUNNER) {
        e.grounded = false;
        checkPlatformCollisions(e, entitiesRef.current);
        // Despawn in pit
        if (e.pos.y > CANVAS_HEIGHT + 100) e.active = false;
      }
    });
    
    // 2. Interaction Collision
    entitiesRef.current.forEach(e => {
       if (!e.active) return;
       
       // Player Bullets vs Enemies
       if (e.type === EntityType.BULLET_PLAYER) {
         entitiesRef.current.forEach(target => {
            if (!target.active) return;
            // Target logic
            const isEnemy = target.type === EntityType.ENEMY_RUNNER || target.type === EntityType.ENEMY_TURRET;
            const isPowerup = target.type === EntityType.POWERUP_CAPSULE;
            
            if (isEnemy || isPowerup) {
              if (checkRectOverlap(e, target)) {
                e.active = false; // Destroy bullet
                target.health--;
                
                if (target.health <= 0) {
                   target.active = false;
                   spawnExplosion(target.pos);
                   
                   if (isPowerup) {
                      player.weaponType = WeaponType.SPREAD;
                      // Floating S text effect
                      entitiesRef.current.push({
                        id: `float-S-${Math.random()}`,
                        type: EntityType.PARTICLE, // Abuse particle type for text
                        pos: { ...target.pos },
                        vel: { x: 0, y: -1 },
                        size: { x: 0, y: 0 }, // No physical size
                        color: '#ff0000',
                        health: 60,
                        active: true,
                        facing: 1,
                        state: 'TEXT_S' // Special flag
                      });
                   } else {
                      gameStateRef.current.score += 100;
                   }
                }
              }
            }
         });
       }
       
       // Enemy/Bullets/Water vs Player
       if (player.active) {
           const isLethal = 
               e.type === EntityType.ENEMY_RUNNER || 
               e.type === EntityType.BULLET_ENEMY ||
               e.type === EntityType.WATER;
               
           if (isLethal) {
              if (checkRectOverlap(e, player)) {
                 // Check if it's the invincible period after spawn
                 // Note: reusing cooldown for invincibility logic here for simplicity
                 // Actually we'll use a separate check or assume cooldown is only for shooting if needed.
                 // Let's assume standard 1 hit kill.
                 handlePlayerDeath();
              }
           }
       }
    });
    
    // Camera Tracking
    const targetX = player.pos.x - CANVAS_WIDTH / 3;
    // Only scroll right
    if (targetX > cameraRef.current.x) {
      cameraRef.current.x = targetX; 
    }
    
    // Limit Camera to boss wall
    const bossWall = entitiesRef.current.find(e => e.id === 'boss-wall');
    if (bossWall && cameraRef.current.x > bossWall.pos.x - CANVAS_WIDTH + 100) {
        cameraRef.current.x = bossWall.pos.x - CANVAS_WIDTH + 100;
    }
    
    // Cleanup entities
    entitiesRef.current = entitiesRef.current.filter(e => {
        const inView = e.pos.x > cameraRef.current.x - 100 && e.pos.x < cameraRef.current.x + CANVAS_WIDTH + 100;
        const isPermanent = e.type === EntityType.WATER || e.id === 'boss-wall';
        return e.active && (isPermanent || inView);
    });
    
  }, [spawnExplosion, handlePlayerDeath, checkPlatformCollisions]);

  // Render Loop
  const draw = useCallback(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     
     // 1. Clear Screen
     ctx.fillStyle = COLORS.SKY;
     ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
     
     ctx.save();
     // Camera Transform
     ctx.translate(-Math.floor(cameraRef.current.x), 0);
     
     // 2. Draw Environment & Enemies
     entitiesRef.current.forEach(e => {
         if (!e.active) return;
         
         if (e.state === 'TEXT_S') {
             // Draw floating S
             ctx.fillStyle = '#ff0000';
             ctx.font = '20px monospace';
             ctx.fillText('S', e.pos.x, e.pos.y);
             return;
         }
         
         ctx.fillStyle = e.color;
         
         if (e.type === EntityType.WATER) {
             ctx.globalAlpha = 0.6;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             ctx.globalAlpha = 1.0;
             // Water line
             ctx.fillStyle = '#fff';
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, 2);
         } else if (e.type === EntityType.ENEMY_TURRET) {
             // Base
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             // Gun Barrel
             ctx.fillStyle = COLORS.TURRET_GUN;
             ctx.save();
             ctx.translate(e.pos.x + e.size.x/2, e.pos.y + e.size.y/2);
             
             // Simple aim at player
             const dx = (playerRef.current.pos.x) - (e.pos.x);
             const dy = (playerRef.current.pos.y) - (e.pos.y);
             const angle = Math.atan2(dy, dx);
             
             ctx.rotate(angle);
             ctx.fillRect(0, -4, 24, 8); // Gun barrel
             ctx.restore();
             
         } else if (e.type === EntityType.POWERUP_CAPSULE) {
             // Capsule shape
             ctx.beginPath();
             ctx.ellipse(e.pos.x + e.size.x/2, e.pos.y + e.size.y/2, e.size.x/2, e.size.y/2, 0, 0, Math.PI*2);
             ctx.fill();
             ctx.fillStyle = '#fff';
             ctx.font = '10px monospace';
             ctx.fillText('S', e.pos.x + 8, e.pos.y + 12);
         } else {
             // Generic Rect (Platforms, Runners, Bullets)
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             
             // Decorate Platforms
             if (e.type === EntityType.PLATFORM && !e.isBridge && e.size.y > 20) {
                 ctx.fillStyle = COLORS.GROUND_SIDE; // darker grass side
                 ctx.fillRect(e.pos.x, e.pos.y + 4, e.size.x, 4);
             }
             if (e.isBridge) {
                 ctx.fillStyle = '#000';
                 for(let k=0; k<e.size.x; k+=16) {
                     ctx.fillRect(e.pos.x + k, e.pos.y, 2, e.size.y);
                 }
             }
         }
     });
     
     // 3. Draw Player
     const p = playerRef.current;
     if (p.active) {
         ctx.save();
         ctx.translate(Math.floor(p.pos.x + p.size.x/2), Math.floor(p.pos.y + p.size.y/2));
         
         if (p.state === 'jump') {
             ctx.rotate(p.angle || 0);
         }
         ctx.scale(p.facing, 1);
         
         // Pants
         ctx.fillStyle = p.color; 
         ctx.fillRect(-p.size.x/2, 0, p.size.x, p.size.y/2);
         // Skin
         ctx.fillStyle = COLORS.PLAYER_SKIN; 
         ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, p.size.y/2);
         // Bandana
         ctx.fillStyle = COLORS.PLAYER_BANDANA; 
         ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, 6);
         
         // Gun (Rifle)
         ctx.fillStyle = '#ccc';
         if (inputRef.current.up) {
             ctx.rotate(-Math.PI/2);
             ctx.fillRect(0, -4, 28, 6);
         } else if (inputRef.current.down && !p.grounded) {
             ctx.rotate(Math.PI/2);
             ctx.fillRect(0, -4, 28, 6);
         } else {
             ctx.fillRect(0, 0, 28, 6);
         }
         
         ctx.restore();
     }
     
     ctx.restore();
     
     // 4. Draw HUD (Static on screen)
     ctx.fillStyle = COLORS.HUD_TEXT;
     ctx.font = '16px "Press Start 2P", monospace';
     ctx.shadowColor = '#000';
     ctx.shadowOffsetX = 2;
     ctx.shadowOffsetY = 2;
     
     ctx.fillText(`P1 ${gameStateRef.current.score.toString().padStart(6, '0')}`, 20, 30);
     ctx.fillText(`REST ${gameStateRef.current.lives}`, 20, 55);
     ctx.fillText(`HI ${gameStateRef.current.highScore}`, 200, 30);
     
     if (gameStateRef.current.gameOver) {
         ctx.fillStyle = 'rgba(0,0,0,0.8)';
         ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
         
         ctx.fillStyle = '#fff';
         ctx.textAlign = 'center';
         ctx.font = '32px "Press Start 2P", monospace';
         ctx.fillText('GAME OVER', CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
         
         ctx.font = '16px "Press Start 2P", monospace';
         ctx.fillText('PRESS R TO RETRY', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 40);
     }
     
  }, []);

  const loop = useCallback(() => {
     update();
     draw();
     requestRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
     requestRef.current = requestAnimationFrame(loop);
     return () => {
         if (requestRef.current) cancelAnimationFrame(requestRef.current);
     };
  }, [loop]);
  
  // Retry Listener
  useEffect(() => {
      const handleRetry = (e: KeyboardEvent) => {
          if (gameStateRef.current.gameOver && e.code === 'KeyR') {
              // Reset Game
              gameStateRef.current.score = 0;
              gameStateRef.current.lives = 3;
              gameStateRef.current.gameOver = false;
              gameStateRef.current.gameWon = false;
              
              // Reset Player
              const p = playerRef.current;
              p.active = true;
              p.health = 1;
              p.pos = { x: 100, y: 100 };
              p.vel = { x: 0, y: 0 };
              p.weaponType = WeaponType.NORMAL;
              
              // Reset Camera
              cameraRef.current = { x: 0, y: 0 };
              
              generateLevel();
          }
      };
      window.addEventListener('keydown', handleRetry);
      return () => window.removeEventListener('keydown', handleRetry);
  }, [generateLevel]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT}
            className="w-full h-full object-contain pixelated-canvas"
        />
    </div>
  );
};

export default GameEngine;