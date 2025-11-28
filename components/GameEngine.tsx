
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
    lives: 3,
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

  const spawnExplosion = useCallback((pos: Vector2) => {
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const speed = 1.5 + Math.random() * 2;
        entitiesRef.current.push({
            id: `exp-${Math.random()}`,
            type: EntityType.PARTICLE,
            pos: { ...pos },
            vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            size: { x: 4, y: 4 },
            color: i % 2 === 0 ? '#ffaa00' : '#ffffff',
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
            // Respawn slightly left of center camera, high up to avoid instant death
            player.pos = { x: cameraRef.current.x + 64, y: 0 };
            player.vel = { x: 0, y: 0 };
            player.weaponType = WeaponType.NORMAL; 
            player.invincibility = 180; // 3 seconds invincibility
            player.cooldown = 0; 
            player.jumpCount = 0;
        }, 1000);
    }
  }, [onGameOver, spawnExplosion]);

  const checkPlatformCollisions = useCallback((entity: GameObject, others: GameObject[]) => {
      // Simple AABB vs Platform one-way collision
      if (entity.vel.y < 0) return; // Moving up, ignore

      const feetY = entity.pos.y + entity.size.y;
      const prevFeetY = feetY - entity.vel.y;

      for (const other of others) {
          if (other.type === EntityType.PLATFORM && other.active) {
              // Horizontal overlap with tolerance
              if (
                  entity.pos.x + entity.size.x > other.pos.x + 2 && 
                  entity.pos.x < other.pos.x + other.size.x - 2
              ) {
                  // Was above?
                  if (feetY >= other.pos.y && prevFeetY <= other.pos.y + 12) { 
                      // Landed
                      entity.pos.y = other.pos.y - entity.size.y;
                      entity.vel.y = 0;
                      entity.grounded = true;
                      
                      // Reset jump count on land
                      if (entity.id === 'player') {
                          entity.jumpCount = 0;
                      }
                      return; 
                  }
              }
          }
      }
  }, []);

  // --- STRUCTURED LEVEL GENERATION (CONTRA LEVEL 1 INSPIRED) ---
  const generateLevel = useCallback(() => {
    const ents: GameObject[] = [];
    const floorY = CANVAS_HEIGHT - 60; 
    let cx = 0;

    // --- Helpers ---
    const addGround = (x: number, width: number, y: number = floorY) => {
        ents.push({
          id: `floor-${x}`,
          type: EntityType.PLATFORM,
          pos: { x: x, y: y },
          vel: { x: 0, y: 0 },
          size: { x: width, y: CANVAS_HEIGHT - y + 200 }, // Extend down
          color: COLORS.GROUND_TOP,
          health: 999,
          active: true,
          facing: 1
        });
    };
    
    const addPlatform = (x: number, y: number, width: number) => {
         ents.push({
            id: `plat-${x}-${y}`,
            type: EntityType.PLATFORM,
            pos: { x: x, y: y },
            vel: { x: 0, y: 0 },
            size: { x: width, y: 20 },
            color: COLORS.GROUND_TOP,
            health: 999,
            active: true,
            facing: 1
          });
    };

    const addBridge = (x: number, width: number, y: number = floorY) => {
        ents.push({
            id: `bridge-${x}`,
            type: EntityType.PLATFORM,
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
            id: `turret-${x}`,
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
            id: `tank-${x}`,
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
          id: `powerup-${x}`,
          type: EntityType.POWERUP_CAPSULE,
          pos: { x: x, y: y },
          vel: { x: 0, y: 0 }, 
          size: { ...SIZES.POWERUP },
          color: '#aa0000',
          health: 1,
          active: true,
          facing: 1,
          dropType: type // Store what it drops
        });
    };

    // --- SEGMENT 1: LANDING ZONE (Tutorial) ---
    addGround(0, 800);
    addPowerup(400, floorY - 120, WeaponType.MACHINE_GUN); // First drop: Machine Gun

    // --- SEGMENT 2: THE CLIFFS (Elevation) ---
    cx = 800;
    // Step up
    addPlatform(cx, floorY - 50, 100);
    addPlatform(cx + 150, floorY - 100, 100);
    
    // High Ground
    addGround(cx + 280, 600, floorY - 100); 
    addTurret(cx + 400, floorY - 100);
    addTurret(cx + 700, floorY - 100);

    // Drop down platforms
    cx += 280 + 600;
    addPlatform(cx + 50, floorY - 50, 100);

    // --- SEGMENT 3: WATER CROSSING (Islands) ---
    cx += 180;
    // Water below
    ents.push({
      id: 'water-seg-1',
      type: EntityType.WATER,
      pos: { x: cx - 100, y: floorY + 30 },
      vel: { x: 0, y: 0 },
      size: { x: 1500, y: 100 },
      color: COLORS.WATER_SURFACE,
      health: 999,
      active: true,
      facing: 1
    });

    // Safe landing
    addGround(cx, 150);
    addPowerup(cx + 75, floorY - 100, WeaponType.SPREAD); // Drop Spread

    cx += 150;
    
    // Floating Islands
    addPlatform(cx + 50, floorY - 20, 80);
    addPlatform(cx + 200, floorY - 60, 80);
    addTurret(cx + 220, floorY - 60);
    
    addPlatform(cx + 350, floorY - 40, 80);
    
    cx += 500;
    
    // --- SEGMENT 4: THE BRIDGE ---
    addBridge(cx, 600, floorY - 40);
    addPowerup(cx + 300, floorY - 150, WeaponType.LASER); // Drop Laser
    
    // Gap after bridge
    cx += 650;
    
    // Safe spot
    addPlatform(cx, floorY - 40, 150);
    cx += 200;

    // --- SEGMENT 5: FINAL APPROACH (Heavily Guarded) ---
    addGround(cx, 1600);
    addTank(cx + 400, floorY); // Tank Encounter
    addTurret(cx + 600, floorY);
    addTank(cx + 900, floorY); // Tank Encounter
    
    // High platforms
    addPlatform(cx + 400, floorY - 100, 120);
    addTurret(cx + 460, floorY - 100);

    cx += 1600;

    // --- BOSS WALL ---
    const wallX = cx;
    ents.push({
        id: 'boss-wall',
        type: EntityType.PLATFORM,
        pos: { x: wallX, y: 0 },
        vel: { x: 0, y: 0 },
        size: { x: 100, y: CANVAS_HEIGHT },
        color: '#500',
        health: 999,
        active: true,
        facing: 1
    });

    // Boss Turrets (Embedded)
    addTurret(wallX - 30, floorY - 40);
    addTurret(wallX - 30, floorY - 140);
    addTurret(wallX - 30, floorY - 240);

    // Kill Floor (Water underneath everything)
    ents.push({
      id: 'kill-floor',
      type: EntityType.WATER,
      pos: { x: -1000, y: CANVAS_HEIGHT + 20 },
      vel: { x: 0, y: 0 },
      size: { x: 20000, y: 200 },
      color: COLORS.WATER_DEEP, // Mostly invisible
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
            lives: 3,
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
      if (gameStateRef.current.gameOver && e.code === 'KeyR') {
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
            gameStateRef.current.lives = 3;
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
    if (!isPlaying || gameStateRef.current.gameOver) return;
    
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
        
        // Ducking
        if (input.down) {
           if (player.grounded) {
             player.vel.x = 0;
             player.state = 'duck';
             player.size.y = 22; 
             player.pos.y += 22; 
           }
        } else {
           if (player.size.y === 22) { // Stand up
             player.size.y = SIZES.PLAYER.y;
             player.pos.y -= 22;
           }
        }

        // UNLIMITED JUMPING: Tap Space multiple times
        const justPressedJump = input.jump && !prevInput.jump;
        if (justPressedJump) {
             // Always allow jump if key is pressed again, resetting Y velocity
             player.vel.y = -JUMP_FORCE;
             player.grounded = false;
             player.state = 'jump';
             // No jumpCount check here = Unlimited
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
          let dirY = 0;

          if (input.up) {
             if (input.right || input.left) { dirY = -0.7; dirX = player.facing * 0.7; }
             else { dirY = -1; dirX = 0; }
          } else if (input.down && !player.grounded) { 
             if (input.right || input.left) { dirY = 0.7; dirX = player.facing * 0.7; }
             else { dirY = 1; dirX = 0; }
          }

          const spawnBullet = (vx: number, vy: number, angleOffset: number = 0) => {
            entitiesRef.current.push({
              id: `pbul-${Math.random()}`,
              type: EntityType.BULLET_PLAYER,
              pos: { 
                x: player.pos.x + player.size.x/2 - 4, 
                y: player.pos.y + (input.down && player.grounded ? 16 : 8) 
              },
              vel: { x: vx, y: vy },
              size: useSpread ? { ...SIZES.SPREAD_BULLET } : useLaser ? { ...SIZES.LASER_BULLET } : { ...SIZES.BULLET },
              color: useLaser ? COLORS.BULLET_LASER : useMG ? COLORS.BULLET_MG : COLORS.BULLET_PLAYER,
              health: 1,
              active: true,
              facing: player.facing,
              piercing: useLaser, // Lasers pierce
              angle: Math.atan2(vy, vx) + angleOffset
            });
          };

          if (useSpread) {
             const baseAngle = Math.atan2(dirY, dirX || 0.001); 
             const angles = [baseAngle, baseAngle - 0.2, baseAngle - 0.1, baseAngle + 0.1, baseAngle + 0.2];
             angles.forEach(a => spawnBullet(Math.cos(a) * bSpeed, Math.sin(a) * bSpeed));
             player.cooldown = 12;
          } else {
             // Normal, Laser, or MG
             if (useMG) {
                 // Slight spread for MG
                 const spreadY = (Math.random() - 0.5) * 2;
                 spawnBullet(dirX * bSpeed, dirY * bSpeed + spreadY);
                 player.cooldown = 4; // Fast fire
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
    
    // Spawning Enemies dynamically
    if (frameCountRef.current % SPAWN_RATE === 0 && !gameStateRef.current.gameOver) {
      const spawnX = cameraRef.current.x + CANVAS_WIDTH + 20;
      
      const playerX = player.pos.x;
      const isBridgeZone = playerX > 1600 && playerX < 2600;
      const isWaterSection = (playerX > 1400 && playerX < 1600);
      
      // Runners
      if ((!isBridgeZone && !isWaterSection) || Math.random() > 0.9) {
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

      // Flying Enemies
      if (isBridgeZone || Math.random() > 0.8) {
          entitiesRef.current.push({
            id: `flyer-${Math.random()}`,
            type: EntityType.ENEMY_FLYING,
            pos: { x: spawnX, y: 100 + Math.random() * 150 },
            initialY: 100 + Math.random() * 150,
            vel: { x: -2.5, y: 0 },
            size: { ...SIZES.ENEMY_FLYING },
            color: COLORS.ENEMY_FLYING,
            health: 1,
            active: true,
            facing: -1
          });
      }
    }

    entitiesRef.current.forEach(e => {
      if (!e.active) return;
      
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
        
        const margin = 50;
        if (e.pos.x < cameraRef.current.x - margin || e.pos.x > cameraRef.current.x + CANVAS_WIDTH + margin || e.pos.y < -margin || e.pos.y > CANVAS_HEIGHT + margin) {
            e.active = false;
        }
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
             health: 1,
             active: true,
             facing: dx > 0 ? 1 : -1
          });
        }
      }

      // Tank AI
      if (e.type === EntityType.ENEMY_TANK) {
         if (e.grounded && player.active) {
             const dist = e.pos.x - player.pos.x;
             // Move towards player slowly
             if (Math.abs(dist) < 500) {
                 e.vel.x = dist > 0 ? -0.5 : 0.5;
                 e.facing = dist > 0 ? -1 : 1;
                 
                 // Shoot
                 if (frameCountRef.current % 150 === 0) {
                      entitiesRef.current.push({
                         id: `tankbul-${Math.random()}`,
                         type: EntityType.BULLET_ENEMY,
                         pos: { x: e.pos.x + (e.facing === 1 ? e.size.x : 0), y: e.pos.y + 10 },
                         vel: { x: e.facing * (BULLET_SPEED * 0.8), y: 0 },
                         size: { x: 12, y: 12 }, // Big bullet
                         color: '#ff8800',
                         health: 1,
                         active: true,
                         facing: e.facing
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
       
       // Player Bullets
       if (e.type === EntityType.BULLET_PLAYER) {
         entitiesRef.current.forEach(target => {
            if (!target.active) return;
            const isEnemy = target.type === EntityType.ENEMY_RUNNER || target.type === EntityType.ENEMY_TURRET || target.type === EntityType.ENEMY_FLYING || target.type === EntityType.ENEMY_TANK;
            const isPowerup = target.type === EntityType.POWERUP_CAPSULE;
            
            if (isEnemy || isPowerup) {
              if (checkRectOverlap(e, target)) {
                if (!e.piercing) e.active = false; // Destroy bullet unless piercing
                target.health--;
                
                if (target.health <= 0) {
                   target.active = false;
                   spawnExplosion(target.pos);
                   
                   if (isPowerup) {
                      const newWeapon = target.dropType || WeaponType.SPREAD;
                      player.weaponType = newWeapon;
                      
                      // Floating Text based on weapon type
                      let char = 'S';
                      if (newWeapon === WeaponType.MACHINE_GUN) char = 'M';
                      if (newWeapon === WeaponType.LASER) char = 'L';
                      
                      entitiesRef.current.push({
                        id: `float-${char}-${Math.random()}`,
                        type: EntityType.PARTICLE, 
                        pos: { ...target.pos },
                        vel: { x: 0, y: -1 },
                        size: { x: 0, y: 0 }, 
                        color: '#ff0000',
                        health: 60,
                        active: true,
                        facing: 1,
                        state: 'TEXT_POPUP',
                        text: char
                      });
                   } else {
                      gameStateRef.current.score += 100;
                   }
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
               e.type === EntityType.ENEMY_FLYING || 
               e.type === EntityType.ENEMY_TANK;
               
           if (isLethal) {
              if (checkRectOverlap(e, player)) {
                 if ((player.invincibility || 0) <= 0) {
                     handlePlayerDeath();
                 }
              }
           }
           // Fall damage / water check
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
    if (bossWall && cameraRef.current.x > bossWall.pos.x - CANVAS_WIDTH + 100) {
        cameraRef.current.x = bossWall.pos.x - CANVAS_WIDTH + 100;
    }
    
    // Cleanup
    entitiesRef.current = entitiesRef.current.filter(e => {
        const inView = e.pos.x > cameraRef.current.x - 200 && e.pos.x < cameraRef.current.x + CANVAS_WIDTH + 200;
        const isPermanent = e.type === EntityType.WATER || e.id === 'boss-wall';
        return e.active && (isPermanent || inView);
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
         // --- TITLE SCREEN ---
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
         
         ctx.fillText('WASD / ARROWS .. MOVE', instrX, instrY); instrY += 25;
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
             // Tank Body
             ctx.fillStyle = COLORS.ENEMY_TANK;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             // Tracks
             ctx.fillStyle = '#000';
             ctx.fillRect(e.pos.x, e.pos.y + e.size.y - 8, e.size.x, 8);
             // Barrel
             ctx.fillStyle = '#004400';
             const facing = e.facing || -1;
             ctx.fillRect(e.pos.x + (facing === 1 ? e.size.x : -20), e.pos.y + 10, 20, 8);
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
             // Determine letter
             let char = 'S';
             if (e.dropType === WeaponType.MACHINE_GUN) char = 'M';
             if (e.dropType === WeaponType.LASER) char = 'L';
             ctx.fillText(char, e.pos.x + e.size.x/2, e.pos.y + e.size.y/2 + 3);
         } else if (e.type === EntityType.BULLET_PLAYER) {
             if (e.piercing) {
                // Draw Laser Beam segment
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
             // Platforms
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             if (e.type === EntityType.PLATFORM && !e.isBridge && e.size.y > 20) {
                 ctx.fillStyle = COLORS.GROUND_SIDE; 
                 ctx.fillRect(e.pos.x, e.pos.y + 4, e.size.x, 8);
                 ctx.fillStyle = '#003300';
                 for(let k=10; k<e.size.x; k+=20) {
                     ctx.fillRect(e.pos.x + k, e.pos.y + 6, 4, 4);
                 }
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
             
             if (p.state === 'jump') {
                 ctx.rotate(p.angle || 0);
             }
             ctx.scale(p.facing, 1);
             
             ctx.fillStyle = p.color; 
             ctx.fillRect(-p.size.x/2, 0, p.size.x, p.size.y/2); 
             ctx.fillStyle = COLORS.PLAYER_SKIN; 
             ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, p.size.y/2); 
             ctx.fillStyle = COLORS.PLAYER_BANDANA; 
             ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, 6); 
             
             ctx.fillStyle = '#ccc';
             if (inputRef.current.up) {
                 ctx.rotate(-Math.PI/2);
                 ctx.fillRect(0, -4, 34, 6);
             } else if (inputRef.current.down && !p.grounded) {
                 ctx.rotate(Math.PI/2);
                 ctx.fillRect(0, -4, 34, 6);
             } else {
                 ctx.fillRect(0, 0, 34, 6);
             }
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
     
     if (gameStateRef.current.gameOver) {
         ctx.fillStyle = 'rgba(0,0,0,0.85)';
         ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
         
         ctx.fillStyle = '#fff';
         ctx.textAlign = 'center';
         ctx.font = '32px "Press Start 2P", monospace';
         ctx.fillText('GAME OVER', CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
         
         ctx.font = '16px "Press Start 2P", monospace';
         ctx.fillText('PRESS R TO RETRY', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 40);
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
