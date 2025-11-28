
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
  
  // Game State Refs
  const cameraRef = useRef<Vector2>({ x: 0, y: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  
  const gameStateRef = useRef<GameState>({
    score: 0,
    lives: 30, // Konami Code style start
    gameOver: false,
    gameWon: false,
    highScore: parseInt(localStorage.getItem('contra_highscore') || '20000', 10),
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
    invincibility: 0,
    jumpCount: 0,
    state: 'idle',
    weaponType: WeaponType.NORMAL,
    angle: 0
  });
  
  const entitiesRef = useRef<GameObject[]>([]);
  const inputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false, jump: false, shoot: false, altFire: false
  });
  const prevInputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false, jump: false, shoot: false, altFire: false
  });

  // --- Effects & Logic ---

  const spawnExplosion = useCallback((pos: Vector2, big: boolean = false) => {
    const count = big ? 20 : 8;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = (big ? 3 : 1.5) + Math.random() * 2;
        entitiesRef.current.push({
            id: `exp-${Math.random()}`,
            type: EntityType.PARTICLE,
            pos: { x: pos.x + (Math.random()*20 - 10), y: pos.y + (Math.random()*20 - 10) },
            vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            size: { x: big ? 8 : 4, y: big ? 8 : 4 },
            color: i % 2 === 0 ? '#ffaa00' : '#ffffff',
            health: big ? 40 : 20, 
            active: true,
            facing: 1
        });
    }
  }, []);

  const handlePlayerDeath = useCallback(() => {
    const player = playerRef.current;
    if (!player.active) return;
    
    player.active = false;
    spawnExplosion(player.pos, true);
    
    gameStateRef.current.lives -= 1;
    if (gameStateRef.current.lives < 0) {
        gameStateRef.current.lives = 2; // Unlimited continues
    }
    
    setTimeout(() => {
        if (!isPlaying) return;
        player.active = true;
        player.health = 1;
        // Respawn logic: Find safe ground near camera
        // Default to top of screen, let gravity handle it, but keep X within camera
        player.pos = { x: Math.max(cameraRef.current.x + 64, 50), y: 0 };
        player.vel = { x: 0, y: 0 };
        player.weaponType = WeaponType.NORMAL; 
        player.invincibility = 180; 
        player.cooldown = 0; 
        player.jumpCount = 0;
    }, 1000);

  }, [spawnExplosion, isPlaying]);

  const checkPlatformCollisions = useCallback((entity: GameObject, others: GameObject[]) => {
      if (entity.vel.y < 0) return; 

      const feetY = entity.pos.y + entity.size.y;
      const prevFeetY = feetY - entity.vel.y;

      for (const other of others) {
          if ((other.type === EntityType.PLATFORM || other.type === EntityType.BRIDGE) && other.active) {
              // Standard Platform Collision
              if (
                  entity.pos.x + entity.size.x > other.pos.x + 4 && 
                  entity.pos.x < other.pos.x + other.size.x - 4
              ) {
                  // Was above?
                  if (feetY >= other.pos.y && prevFeetY <= other.pos.y + 16) { 
                      // Landed
                      entity.pos.y = other.pos.y - entity.size.y;
                      entity.vel.y = 0;
                      entity.grounded = true;
                      
                      if (entity.id === 'player') entity.jumpCount = 0;
                      return; 
                  }
              }
          }
      }
  }, []);

  // --- COMPREHENSIVE LEVEL GENERATION ---
  const generateLevel = useCallback(() => {
    const ents: GameObject[] = [];
    const floorY = CANVAS_HEIGHT - 60; 
    let cx = 0;

    // --- Builders ---
    const addGround = (x: number, width: number, y: number = floorY) => {
        ents.push({
          id: `floor-${x}-${Math.random()}`,
          type: EntityType.PLATFORM,
          pos: { x: x, y: y },
          vel: { x: 0, y: 0 },
          size: { x: width, y: CANVAS_HEIGHT - y + 500 }, // Extend way down so it never disappears
          color: COLORS.GROUND_TOP,
          health: 999,
          active: true,
          facing: 1
        });
    };
    
    const addPlatform = (x: number, y: number, width: number) => {
         ents.push({
            id: `plat-${x}-${y}-${Math.random()}`,
            type: EntityType.PLATFORM,
            pos: { x: x, y: y },
            vel: { x: 0, y: 0 },
            size: { x: width, y: 30 }, // Thicker platforms
            color: COLORS.GROUND_TOP,
            health: 999,
            active: true,
            facing: 1
          });
    };

    const addBridge = (x: number, width: number, y: number = floorY) => {
        ents.push({
            id: `bridge-${x}-${Math.random()}`,
            type: EntityType.BRIDGE,
            pos: { x: x, y: y },
            vel: { x: 0, y: 0 },
            size: { x: width, y: 20 },
            color: COLORS.BRIDGE,
            health: 999,
            active: true,
            facing: 1,
            isBridge: true
        });
    }
    
    const addTurret = (x: number, y: number) => {
         ents.push({
            id: `turret-${x}-${Math.random()}`,
            type: EntityType.ENEMY_TURRET,
            pos: { x: x, y: y - 32 },
            vel: { x: 0, y: 0 },
            size: { ...SIZES.ENEMY_TURRET },
            color: COLORS.TURRET_BASE,
            health: 3,
            active: true,
            facing: -1
          });
    };
    
    const addTank = (x: number, y: number) => {
        ents.push({
            id: `tank-${x}-${Math.random()}`,
            type: EntityType.ENEMY_TANK,
            pos: { x: x, y: y - 40 },
            vel: { x: 0, y: 0 },
            size: { ...SIZES.ENEMY_TANK },
            color: COLORS.ENEMY_TANK,
            health: 12,
            active: true,
            facing: -1
        });
    }

    const addPowerup = (x: number, y: number, type: WeaponType) => {
         ents.push({
          id: `powerup-${x}-${Math.random()}`,
          type: EntityType.POWERUP_CAPSULE,
          pos: { x: x, y: y },
          vel: { x: 0, y: 0 }, 
          size: { ...SIZES.POWERUP },
          color: '#aa0000',
          health: 1,
          active: true,
          facing: 1,
          dropType: type 
        });
    };

    // --- LEVEL DESIGN ---

    // ZONE 1: THE JUNGLE (Start)
    // Long stretch to run and gun
    addGround(0, 1000);
    addPowerup(400, floorY - 120, WeaponType.MACHINE_GUN); 
    addTurret(700, floorY);
    addTurret(900, floorY);

    cx = 1000;

    // ZONE 2: THE WATERFALL ASCENT (Verticality)
    addGround(cx, 300); // Base
    // Steps up
    addPlatform(cx + 350, floorY - 60, 100);
    addPlatform(cx + 450, floorY - 120, 100);
    addPlatform(cx + 300, floorY - 180, 150);
    addTurret(cx + 350, floorY - 180);
    
    addPlatform(cx + 500, floorY - 150, 200);
    addPowerup(cx + 600, floorY - 200, WeaponType.SPREAD);
    
    addGround(cx + 700, 400); // Landing
    addTank(cx + 900, floorY);

    cx += 1100;

    // ZONE 3: THE BRIDGE (Water Hazard)
    // Water base logic is handled by a single huge water entity usually, or segments
    ents.push({
      id: 'water-zone-3',
      type: EntityType.WATER,
      pos: { x: cx - 100, y: floorY + 30 },
      vel: { x: 0, y: 0 },
      size: { x: 2500, y: 150 },
      color: COLORS.WATER_SURFACE,
      health: 999,
      active: true,
      facing: 1
    });

    addBridge(cx, 300, floorY - 60);
    addPlatform(cx + 350, floorY - 40, 60); // Tiny island
    addPlatform(cx + 450, floorY - 40, 60);
    addPlatform(cx + 550, floorY - 80, 60);
    addPowerup(cx + 560, floorY - 150, WeaponType.LASER);
    
    addBridge(cx + 700, 400, floorY - 60);
    addTurret(cx + 800, floorY - 60);
    addTurret(cx + 1000, floorY - 60);

    cx += 1200;

    // ZONE 4: THE SNOW FIELD (Tanks & Hard Jumps)
    addGround(cx, 1000);
    addTank(cx + 400, floorY);
    addPlatform(cx + 500, floorY - 100, 200);
    addTurret(cx + 600, floorY - 100);
    addTank(cx + 800, floorY);
    
    cx += 1000;

    // ZONE 5: THE HANGAR (Fortress)
    addGround(cx, 800, floorY + 50); // Lower ground
    addPlatform(cx, floorY - 100, 800); // Ceiling/Upper deck
    addTurret(cx + 200, floorY - 100);
    addTurret(cx + 400, floorY - 100);
    addTurret(cx + 600, floorY - 100);
    addTank(cx + 500, floorY + 50);
    
    addPowerup(cx + 400, floorY, WeaponType.SPREAD); // Mid-air pickup

    cx += 900;

    // ZONE 6: BOSS ARENA
    addGround(cx, 800);
    
    // THE BOSS
    ents.push({
        id: 'BOSS_CORE',
        type: EntityType.ENEMY_BOSS,
        pos: { x: cx + 500, y: floorY - 160 },
        vel: { x: 0, y: 0 },
        size: { ...SIZES.ENEMY_BOSS },
        color: COLORS.ENEMY_BOSS,
        health: 250, // High health
        maxHealth: 250,
        active: true,
        facing: -1,
        bossPhase: 0
    });

    // Boss Wall backing
    ents.push({
        id: 'boss-wall',
        type: EntityType.PLATFORM,
        pos: { x: cx + 640, y: 0 },
        vel: { x: 0, y: 0 },
        size: { x: 100, y: CANVAS_HEIGHT },
        color: '#300',
        health: 999,
        active: true,
        facing: 1
    });

    // Global Water Floor (Death Plane)
    ents.push({
      id: 'kill-floor',
      type: EntityType.WATER,
      pos: { x: -1000, y: CANVAS_HEIGHT + 40 },
      vel: { x: 0, y: 0 },
      size: { x: 50000, y: 200 },
      color: COLORS.WATER_DEEP, 
      health: 999,
      active: true,
      facing: 1
    });

    entitiesRef.current = ents;
  }, []);

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying && (e.code === 'Enter' || e.code === 'Space')) {
        setIsPlaying(true);
        gameStateRef.current = {
            score: 0,
            lives: 30,
            gameOver: false,
            gameWon: false,
            highScore: gameStateRef.current.highScore
        };
        playerRef.current.active = true;
        playerRef.current.pos = { x: 100, y: 100 };
        playerRef.current.invincibility = 0;
        cameraRef.current = { x: 0, y: 0 };
        generateLevel();
        return;
      }
      if ((gameStateRef.current.gameOver || gameStateRef.current.gameWon) && e.code === 'KeyR') {
           setIsPlaying(false); 
           return;
      }
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
    
    const handleMouseDown = (e: MouseEvent) => {
        if (!isPlaying) {
            setIsPlaying(true);
            gameStateRef.current.lives = 30;
            gameStateRef.current.score = 0;
            gameStateRef.current.gameOver = false;
            playerRef.current.active = true;
            generateLevel();
            return;
        }
        if (e.button === 0) inputRef.current.shoot = true;
        if (e.button === 2) inputRef.current.altFire = true;
    };
    const handleMouseUp = (e: MouseEvent) => {
        if (e.button === 0) inputRef.current.shoot = false;
        if (e.button === 2) inputRef.current.altFire = false;
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    
    generateLevel();
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [generateLevel, isPlaying]);

  // Main Game Loop Update
  const update = useCallback(() => {
    if (!isPlaying) return;
    
    if (gameStateRef.current.gameWon) {
        // Just animate fireworks or something
        if (frameCountRef.current % 10 === 0) {
            spawnExplosion({ x: cameraRef.current.x + Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT }, true);
        }
        return;
    }

    frameCountRef.current++;
    const player = playerRef.current;
    const input = inputRef.current;
    const prevInput = prevInputRef.current;
    
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
        
        if (input.down) {
           if (player.grounded) {
             player.vel.x = 0;
             player.state = 'duck';
             player.size.y = 22; 
             player.pos.y += 22; 
           }
        } else {
           if (player.size.y === 22) { 
             player.size.y = SIZES.PLAYER.y;
             player.pos.y -= 22;
           }
        }

        const justPressedJump = input.jump && !prevInput.jump;
        if (justPressedJump) {
             player.vel.y = -JUMP_FORCE;
             player.grounded = false;
             player.state = 'jump';
        }

        if (!player.grounded) {
          player.state = 'jump';
          player.angle = (player.angle || 0) + 0.35 * player.facing;
        } else {
          player.angle = 0;
        }

        player.vel.y += GRAVITY;
        player.pos.x += player.vel.x;
        player.pos.y += player.vel.y;
        if (player.vel.y > 10) player.vel.y = 10;

        // --- Shooting ---
        const isShooting = input.shoot || input.altFire;
        if (isShooting && (player.cooldown || 0) <= 0) {
          const useSpread = player.weaponType === WeaponType.SPREAD || input.altFire;
          const useLaser = player.weaponType === WeaponType.LASER && !input.altFire;
          const useMG = player.weaponType === WeaponType.MACHINE_GUN && !input.altFire;
          
          const bSpeed = useLaser ? BULLET_SPEED * 1.5 : BULLET_SPEED;
          
          let dirX: number = player.facing;
          let dirY: number = 0;
          
          const isMoving = input.left || input.right;

          if (input.up) {
              if (isMoving) { dirY = -0.707; dirX = player.facing * 0.707; }
              else { dirY = -1; dirX = 0; }
          } else if (input.down) {
              if (player.grounded) { dirY = 0; dirX = player.facing; } // Crouch
              else { 
                  if (isMoving) { dirY = 0.707; dirX = player.facing * 0.707; }
                  else { dirY = 1; dirX = 0; }
              }
          } else {
              dirY = 0; dirX = player.facing;
          }

          const spawnBullet = (vx: number, vy: number, angleOffset: number = 0) => {
            let spawnY = player.pos.y + 8;
            if (input.down && player.grounded) spawnY = player.pos.y + 16;
            if (input.up) spawnY = player.pos.y - 4;

            entitiesRef.current.push({
              id: `pbul-${Math.random()}`,
              type: EntityType.BULLET_PLAYER,
              pos: { x: player.pos.x + player.size.x/2 - 4, y: spawnY },
              vel: { x: vx, y: vy },
              size: useSpread ? { ...SIZES.SPREAD_BULLET } : useLaser ? { ...SIZES.LASER_BULLET } : { ...SIZES.BULLET },
              color: useLaser ? COLORS.BULLET_LASER : useMG ? COLORS.BULLET_MG : COLORS.BULLET_PLAYER,
              health: 1,
              active: true,
              facing: player.facing,
              piercing: useLaser,
              angle: Math.atan2(vy, vx) + angleOffset
            });
          };

          if (useSpread) {
             const baseAngle = Math.atan2(dirY, dirX || (player.facing * 0.01)); 
             const angles = [baseAngle, baseAngle - 0.25, baseAngle - 0.12, baseAngle + 0.12, baseAngle + 0.25];
             angles.forEach(a => spawnBullet(Math.cos(a) * bSpeed, Math.sin(a) * bSpeed));
             player.cooldown = 12;
          } else {
             if (useMG) {
                 const spreadY = (Math.random() - 0.5) * 1.5;
                 spawnBullet(dirX * bSpeed, dirY * bSpeed + spreadY);
                 player.cooldown = 4; 
             } else {
                 spawnBullet(dirX * bSpeed, dirY * bSpeed);
                 player.cooldown = useLaser ? 15 : 9;
             }
          }
        }
        
        if (player.cooldown && player.cooldown > 0) player.cooldown--;
        if (player.invincibility && player.invincibility > 0) player.invincibility--;
    } 

    // --- Entities Update ---
    
    // Spawning Logic (Dynamic)
    if (frameCountRef.current % SPAWN_RATE === 0 && !gameStateRef.current.gameOver) {
      const spawnX = cameraRef.current.x + CANVAS_WIDTH + 20;
      const playerX = player.pos.x;
      
      // Don't spawn runners in boss room or deep pits
      const bossRoom = playerX > 4000;
      
      if (!bossRoom) {
          if (Math.random() > 0.5) {
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

          if (Math.random() > 0.7) {
              entitiesRef.current.push({
                id: `flyer-${Math.random()}`,
                type: EntityType.ENEMY_FLYING,
                pos: { x: spawnX, y: 50 + Math.random() * 150 },
                initialY: 50 + Math.random() * 150,
                vel: { x: -3, y: 0 },
                size: { ...SIZES.ENEMY_FLYING },
                color: COLORS.ENEMY_FLYING,
                health: 1,
                active: true,
                facing: -1
              });
          }
      }
    }

    entitiesRef.current.forEach(e => {
      if (!e.active) return;
      
      // --- BOSS AI ---
      if (e.type === EntityType.ENEMY_BOSS) {
         // Hover Movement
         e.pos.y = (CANVAS_HEIGHT - 220) + Math.sin(frameCountRef.current * 0.02) * 60;
         
         // Attack Pattern
         if (player.active) {
             const phase = frameCountRef.current % 300;
             
             // Rapid Fire MG
             if (phase > 100 && phase < 200 && phase % 10 === 0) {
                 const dx = player.pos.x - e.pos.x;
                 const dy = player.pos.y - (e.pos.y + 80);
                 const angle = Math.atan2(dy, dx);
                 entitiesRef.current.push({
                     id: `boss-gun-${Math.random()}`,
                     type: EntityType.BULLET_ENEMY,
                     pos: { x: e.pos.x, y: e.pos.y + 80 },
                     vel: { x: Math.cos(angle)*8, y: Math.sin(angle)*8 },
                     size: { ...SIZES.BULLET },
                     color: '#ffff00',
                     health: 1, active: true, facing: -1
                 });
             }
             
             // Rockets
             if (phase === 250) {
                 entitiesRef.current.push({
                     id: `rocket-${Math.random()}`,
                     type: EntityType.BULLET_ROCKET,
                     pos: { x: e.pos.x + 20, y: e.pos.y + 20 },
                     vel: { x: -3, y: -3 }, // Pop up
                     size: { ...SIZES.ROCKET },
                     color: '#fff',
                     health: 1, active: true, facing: -1,
                     angle: 0
                 });
             }
         }
      }
      
      // Rocket Logic (Tracking)
      if (e.type === EntityType.BULLET_ROCKET) {
          if (player.active) {
              const dx = player.pos.x - e.pos.x;
              const dy = player.pos.y - e.pos.y;
              // Simple steering
              e.vel.x += dx * 0.002;
              e.vel.y += dy * 0.002;
              // Cap Speed
              const maxSpd = 5;
              e.vel.x = Math.max(-maxSpd, Math.min(maxSpd, e.vel.x));
              e.vel.y = Math.max(-maxSpd, Math.min(maxSpd, e.vel.y));
          }
          e.pos.x += e.vel.x;
          e.pos.y += e.vel.y;
          // Smoke trail
          if (frameCountRef.current % 4 === 0) {
              entitiesRef.current.push({
                  id: `smoke-${Math.random()}`,
                  type: EntityType.PARTICLE,
                  pos: { ...e.pos },
                  vel: { x: 0, y: 0 },
                  size: { x: 4, y: 4 },
                  color: '#aaa',
                  health: 10, active: true, facing: 1
              });
          }
      }

      // Physics
      if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.PARTICLE || e.type === EntityType.ENEMY_TANK) {
        e.vel.y += GRAVITY;
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      } else if (e.type === EntityType.ENEMY_FLYING) {
         e.pos.x += e.vel.x;
         e.pos.y = (e.initialY || 100) + Math.sin(e.pos.x * 0.02) * 40;
      } else if (e.type === EntityType.BULLET_PLAYER || e.type === EntityType.BULLET_ENEMY) {
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      }
      
      if (e.type === EntityType.POWERUP_CAPSULE) {
        e.pos.x += Math.sin(frameCountRef.current / 15) * 2;
        e.pos.y += Math.cos(frameCountRef.current / 15) * 0.5;
      }
      
      // Turret AI
      if (e.type === EntityType.ENEMY_TURRET) {
        const dist = Math.abs(e.pos.x - player.pos.x);
        if (dist < 450 && dist > 20 && frameCountRef.current % 110 === 0 && player.active) {
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
             health: 1, active: true, facing: dx > 0 ? 1 : -1
          });
        }
      }

      // Tank AI
      if (e.type === EntityType.ENEMY_TANK) {
         if (e.grounded && player.active) {
             const dist = e.pos.x - player.pos.x;
             if (Math.abs(dist) < 500) {
                 e.vel.x = dist > 0 ? -0.5 : 0.5;
                 e.facing = dist > 0 ? -1 : 1;
                 if (frameCountRef.current % 150 === 0) {
                      entitiesRef.current.push({
                         id: `tankbul-${Math.random()}`,
                         type: EntityType.BULLET_ENEMY,
                         pos: { x: e.pos.x + (e.facing === 1 ? e.size.x : 0), y: e.pos.y + 10 },
                         vel: { x: e.facing * (BULLET_SPEED * 0.8), y: 0 },
                         size: { x: 12, y: 12 },
                         color: '#ff8800',
                         health: 1, active: true, facing: e.facing
                      });
                 }
             } else {
                 e.vel.x = 0;
             }
         }
      }
      
      if (e.type === EntityType.PARTICLE) {
          e.health--;
          if (e.health <= 0) e.active = false;
      }
    });

    // --- Collisions ---
    if (player.active) {
        player.grounded = false;
        checkPlatformCollisions(player, entitiesRef.current);
    }
    
    entitiesRef.current.forEach(e => {
      if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.ENEMY_TANK) {
        e.grounded = false;
        checkPlatformCollisions(e, entitiesRef.current);
        if (e.pos.y > CANVAS_HEIGHT + 100) e.active = false;
      }
    });
    
    entitiesRef.current.forEach(e => {
       if (!e.active) return;
       
       // Player Bullets Collisions
       if (e.type === EntityType.BULLET_PLAYER) {
         entitiesRef.current.forEach(target => {
            if (!target.active) return;
            const isEnemy = target.type === EntityType.ENEMY_RUNNER || target.type === EntityType.ENEMY_TURRET || target.type === EntityType.ENEMY_FLYING || target.type === EntityType.ENEMY_TANK || target.type === EntityType.ENEMY_BOSS;
            const isPowerup = target.type === EntityType.POWERUP_CAPSULE;
            
            if (isEnemy || isPowerup) {
              if (checkRectOverlap(e, target)) {
                if (!e.piercing) e.active = false; 
                target.health--;
                
                if (target.health <= 0) {
                   target.active = false;
                   
                   if (target.type === EntityType.ENEMY_BOSS) {
                       spawnExplosion(target.pos, true);
                       gameStateRef.current.gameWon = true;
                       gameStateRef.current.score += 10000;
                   } else {
                       spawnExplosion(target.pos);
                       gameStateRef.current.score += 100;
                   }
                   
                   if (isPowerup) {
                      const newWeapon = target.dropType || WeaponType.SPREAD;
                      player.weaponType = newWeapon;
                      let char = 'S';
                      if (newWeapon === WeaponType.MACHINE_GUN) char = 'M';
                      if (newWeapon === WeaponType.LASER) char = 'L';
                      entitiesRef.current.push({
                        id: `float-${char}-${Math.random()}`, type: EntityType.PARTICLE, pos: { ...target.pos },
                        vel: { x: 0, y: -1 }, size: { x: 0, y: 0 }, color: '#ff0000',
                        health: 60, active: true, facing: 1, state: 'TEXT_POPUP', text: char
                      });
                   }
                } else if (target.type === EntityType.ENEMY_BOSS) {
                    // Feedback for boss hit
                    entitiesRef.current.push({
                        id: `hit-${Math.random()}`, type: EntityType.PARTICLE, pos: { ...e.pos },
                        vel: { x: Math.random()*2-1, y: Math.random()*2-1 }, size: { x: 2, y: 2 }, color: '#fff',
                        health: 5, active: true, facing: 1
                    });
                }
              }
            }
         });
       }
       
       // Player Damage
       if (player.active) {
           const isLethal = 
               e.type === EntityType.ENEMY_RUNNER || 
               e.type === EntityType.BULLET_ENEMY ||
               e.type === EntityType.BULLET_ROCKET ||
               e.type === EntityType.ENEMY_FLYING || 
               e.type === EntityType.ENEMY_TANK ||
               e.type === EntityType.ENEMY_BOSS;
               
           if (isLethal) {
              if (checkRectOverlap(e, player)) {
                 if ((player.invincibility || 0) <= 0) {
                     handlePlayerDeath();
                 }
              }
           }
           if (player.pos.y > CANVAS_HEIGHT) {
               handlePlayerDeath();
           }
       }
    });
    
    // Camera Tracking
    const targetX = player.pos.x - CANVAS_WIDTH / 3;
    if (targetX > cameraRef.current.x) {
      cameraRef.current.x = targetX; 
    }
    const bossWall = entitiesRef.current.find(e => e.id === 'boss-wall');
    if (bossWall && cameraRef.current.x > bossWall.pos.x - CANVAS_WIDTH + 50) {
        cameraRef.current.x = bossWall.pos.x - CANVAS_WIDTH + 50;
    }
    
    // Cleanup - ROBUST CULLING
    entitiesRef.current = entitiesRef.current.filter(e => {
        // NEVER DELETE WORLD GEOMETRY
        if (e.type === EntityType.PLATFORM || e.type === EntityType.BRIDGE || e.type === EntityType.WATER || e.type === EntityType.ENEMY_BOSS || e.id === 'boss-wall') return true;

        // Cleanup projectiles and enemies if they are way off screen
        const margin = 500;
        const cameraLeft = cameraRef.current.x - margin;
        const cameraRight = cameraRef.current.x + CANVAS_WIDTH + margin;
        
        return e.active && e.pos.x > cameraLeft && e.pos.x < cameraRight;
    });
    
    prevInputRef.current = { ...input };

  }, [isPlaying, spawnExplosion, handlePlayerDeath, checkPlatformCollisions]);

  // Render Loop
  const draw = useCallback(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     
     // 1. Clear
     ctx.fillStyle = COLORS.SKY;
     ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
     
     if (!isPlaying) {
         ctx.fillStyle = '#000';
         ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
         ctx.textAlign = 'center';
         ctx.font = '70px "Press Start 2P"';
         ctx.fillStyle = '#aa0000';
         ctx.shadowColor = '#fff';
         ctx.shadowOffsetX = 4;
         ctx.shadowOffsetY = 4;
         ctx.fillText('CONTRA', CANVAS_WIDTH/2, 140);
         ctx.shadowColor = 'transparent';
         ctx.font = '16px "Press Start 2P"';
         ctx.fillStyle = '#ccc';
         ctx.fillText('CONTROLS', CANVAS_WIDTH/2, 220);
         ctx.font = '12px "Press Start 2P"';
         ctx.fillStyle = '#fff';
         ctx.textAlign = 'left';
         const instrX = CANVAS_WIDTH/2 - 120;
         let instrY = 260;
         ctx.fillText('WASD / ARROWS .. MOVE & AIM', instrX, instrY); instrY += 25;
         ctx.fillText('SPACE (TAP) .... FLY/JUMP', instrX, instrY); instrY += 25;
         ctx.fillText('LEFT CLICK ..... FIRE', instrX, instrY); instrY += 25;
         ctx.fillText('RIGHT CLICK .... SUPER WEAPON', instrX, instrY); instrY += 25;
         ctx.fillText('R .............. RESET', instrX, instrY);
         ctx.textAlign = 'center';
         ctx.fillStyle = '#f8b800';
         ctx.fillText('CLICK OR PRESS ENTER TO START', CANVAS_WIDTH/2, 420);
         return;
     }

     ctx.save();
     ctx.translate(-Math.floor(cameraRef.current.x), 0);
     
     // 2. Draw Environment & Enemies
     entitiesRef.current.forEach(e => {
         if (!e.active) return;
         if (e.state === 'TEXT_POPUP') {
             ctx.fillStyle = '#ff0000';
             ctx.font = '20px monospace';
             ctx.fillText(e.text || '?', e.pos.x, e.pos.y);
             return;
         }
         
         ctx.fillStyle = e.color;
         
         if (e.type === EntityType.WATER) {
             ctx.globalAlpha = 0.8;
             ctx.fillStyle = COLORS.WATER_DEEP;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             ctx.fillStyle = COLORS.WATER_SURFACE;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, 10);
             ctx.globalAlpha = 1.0;
         } else if (e.type === EntityType.ENEMY_TURRET) {
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             ctx.fillStyle = COLORS.TURRET_GUN;
             ctx.save();
             ctx.translate(e.pos.x + e.size.x/2, e.pos.y + e.size.y/2);
             const dx = (playerRef.current.pos.x) - (e.pos.x);
             const dy = (playerRef.current.pos.y) - (e.pos.y);
             const angle = Math.atan2(dy, dx);
             ctx.rotate(angle);
             ctx.fillRect(0, -4, 24, 8); 
             ctx.restore();
         } else if (e.type === EntityType.ENEMY_TANK) {
             ctx.fillStyle = COLORS.ENEMY_TANK;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             ctx.fillStyle = '#000';
             ctx.fillRect(e.pos.x, e.pos.y + e.size.y - 8, e.size.x, 8); // Tracks
             ctx.fillStyle = '#004400';
             const facing = e.facing || -1;
             ctx.fillRect(e.pos.x + (facing === 1 ? e.size.x : -20), e.pos.y + 10, 20, 8);
         } else if (e.type === EntityType.ENEMY_BOSS) {
             // Boss Draw
             ctx.fillStyle = '#555';
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y); // Body
             // Eye
             ctx.fillStyle = frameCountRef.current % 60 < 30 ? '#ff0000' : '#880000';
             ctx.fillRect(e.pos.x + 40, e.pos.y + 40, 60, 40);
             // Guns
             ctx.fillStyle = '#333';
             ctx.fillRect(e.pos.x + 10, e.pos.y + 100, 20, 40);
             ctx.fillRect(e.pos.x + 110, e.pos.y + 100, 20, 40);
             // Health Bar
             ctx.fillStyle = '#f00';
             const hp = (e.health / (e.maxHealth || 1));
             ctx.fillRect(e.pos.x, e.pos.y - 10, e.size.x * hp, 5);
         } else if (e.type === EntityType.BULLET_ROCKET) {
             ctx.fillStyle = '#fff';
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
         } else if (e.type === EntityType.ENEMY_FLYING) {
             ctx.beginPath();
             ctx.ellipse(e.pos.x + e.size.x/2, e.pos.y + e.size.y/2, e.size.x/2, e.size.y/4, 0, 0, Math.PI*2);
             ctx.fill();
             ctx.fillStyle = '#ffaa00';
             ctx.beginPath();
             ctx.arc(e.pos.x + e.size.x, e.pos.y + e.size.y/2, 4, 0, Math.PI*2);
             ctx.fill();
         } else if (e.type === EntityType.POWERUP_CAPSULE) {
             ctx.beginPath();
             ctx.ellipse(e.pos.x + e.size.x/2, e.pos.y + e.size.y/2, e.size.x/2, e.size.y/2, 0, 0, Math.PI*2);
             ctx.fill();
             ctx.fillStyle = '#fff';
             ctx.textAlign = 'center';
             ctx.font = '10px monospace';
             let char = 'S';
             if (e.dropType === WeaponType.MACHINE_GUN) char = 'M';
             if (e.dropType === WeaponType.LASER) char = 'L';
             ctx.fillText(char, e.pos.x + e.size.x/2, e.pos.y + e.size.y/2 + 3);
         } else if (e.type === EntityType.BULLET_PLAYER) {
             if (e.piercing) {
                ctx.save();
                ctx.translate(e.pos.x, e.pos.y);
                ctx.rotate(e.angle || 0);
                ctx.fillRect(0, -2, e.size.x, e.size.y);
                ctx.restore();
             } else {
                ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             }
         } else if (e.type === EntityType.PARTICLE) {
             ctx.beginPath();
             ctx.arc(e.pos.x, e.pos.y, e.size.x, 0, Math.PI*2);
             ctx.fill();
         } else {
             // Platforms - Mario/Contra Style Solid Blocks
             if (e.type === EntityType.PLATFORM && !e.isBridge) {
                 // Solid fill
                 ctx.fillStyle = COLORS.GROUND_TOP;
                 ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
                 
                 // Texture Pattern
                 ctx.fillStyle = '#000000';
                 ctx.globalAlpha = 0.2;
                 // Border
                 ctx.strokeRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
                 // Rock/Metal details
                 for(let i=0; i<e.size.x; i+=40) {
                     for(let j=0; j<e.size.y; j+=40) {
                        ctx.fillRect(e.pos.x + i, e.pos.y + j, 30, 30);
                     }
                 }
                 ctx.globalAlpha = 1.0;
                 
                 // Grass Top
                 ctx.fillStyle = '#88cc88';
                 ctx.fillRect(e.pos.x, e.pos.y, e.size.x, 6);
                 
             } else {
                 ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
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
         if ((p.invincibility || 0) > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
            // Blink
         } else {
             ctx.save();
             ctx.translate(Math.floor(p.pos.x + p.size.x/2), Math.floor(p.pos.y + p.size.y/2));
             if (p.state === 'jump') ctx.rotate(p.angle || 0);
             ctx.scale(p.facing, 1);
             ctx.fillStyle = p.color; ctx.fillRect(-p.size.x/2, 0, p.size.x, p.size.y/2); 
             ctx.fillStyle = COLORS.PLAYER_SKIN; ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, p.size.y/2); 
             ctx.fillStyle = COLORS.PLAYER_BANDANA; ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, 6); 
             ctx.fillStyle = '#ccc';
             let gunAngle = 0;
             if (inputRef.current.up) {
                 if (inputRef.current.right || inputRef.current.left) gunAngle = -Math.PI/4;
                 else gunAngle = -Math.PI/2;
             } else if (inputRef.current.down && !p.grounded) {
                  if (inputRef.current.right || inputRef.current.left) gunAngle = Math.PI/4;
                  else gunAngle = Math.PI/2;
             }
             ctx.rotate(gunAngle);
             ctx.fillRect(0, -4, 34, 6);
             ctx.restore();
         }
     }
     
     ctx.restore();
     
     // 4. HUD
     ctx.fillStyle = COLORS.HUD_TEXT;
     ctx.textAlign = 'left';
     ctx.font = '16px "Press Start 2P", monospace';
     ctx.shadowColor = '#000';
     ctx.shadowOffsetX = 2;
     ctx.shadowOffsetY = 2;
     ctx.fillText(`P1 ${gameStateRef.current.score.toString().padStart(6, '0')}`, 20, 30);
     ctx.fillText(`REST ${gameStateRef.current.lives}`, 20, 55);
     ctx.textAlign = 'right';
     ctx.fillText(`HI ${gameStateRef.current.highScore}`, CANVAS_WIDTH - 20, 30);

     if (gameStateRef.current.gameWon) {
         ctx.fillStyle = 'rgba(0,0,0,0.6)';
         ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
         ctx.fillStyle = '#fff';
         ctx.textAlign = 'center';
         ctx.font = '32px "Press Start 2P"';
         ctx.fillText('MISSION ACCOMPLISHED', CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
         ctx.font = '16px "Press Start 2P"';
         ctx.fillText('PRESS R TO RESTART', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 50);
     }
     
  }, [isPlaying]);

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
