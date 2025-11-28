
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EntityType, GameObject, GameState, InputState, Vector2, WeaponType } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, PLAYER_SPEED, JUMP_FORCE, BULLET_SPEED, ENEMY_SPEED, SPAWN_RATE, COLORS, SIZES, ROCKET_SPEED } from '../constants';

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
    angle: 0,
    rocketTimer: 0
  });
  
  const entitiesRef = useRef<GameObject[]>([]);
  const inputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false, jump: false, shoot: false, altFire: false, rocket: false
  });
  const prevInputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false, jump: false, shoot: false, altFire: false, rocket: false
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
        player.pos = { x: Math.max(cameraRef.current.x + 64, 50), y: 0 };
        player.vel = { x: 0, y: 0 };
        player.weaponType = WeaponType.NORMAL; 
        player.invincibility = 180; 
        player.cooldown = 0; 
        player.jumpCount = 0;
        player.rocketTimer = 0;
    }, 1000);

  }, [spawnExplosion, isPlaying]);

  const checkPlatformCollisions = useCallback((entity: GameObject, others: GameObject[]) => {
      if (entity.vel.y < 0) return; 

      const feetY = entity.pos.y + entity.size.y;
      const prevFeetY = feetY - entity.vel.y;

      for (const other of others) {
          if ((other.type === EntityType.PLATFORM || other.type === EntityType.BRIDGE) && other.active) {
              if (
                  entity.pos.x + entity.size.x > other.pos.x + 4 && 
                  entity.pos.x < other.pos.x + other.size.x - 4
              ) {
                  if (feetY >= other.pos.y && prevFeetY <= other.pos.y + 16) { 
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

  // --- LEVEL GENERATION ---
  const generateLevel = useCallback(() => {
    const ents: GameObject[] = [];
    const floorY = CANVAS_HEIGHT - 60; 
    let cx = 0;

    const addGround = (x: number, width: number, y: number = floorY) => {
        ents.push({
          id: `floor-${x}-${Math.random()}`,
          type: EntityType.PLATFORM,
          pos: { x: x, y: y },
          vel: { x: 0, y: 0 },
          size: { x: width, y: CANVAS_HEIGHT - y + 500 },
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
            size: { x: width, y: 30 },
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

    const addSniper = (x: number, y: number) => {
        ents.push({
            id: `sniper-${x}-${Math.random()}`,
            type: EntityType.ENEMY_SNIPER,
            pos: { x: x, y: y - 34 },
            vel: { x: 0, y: 0 },
            size: { ...SIZES.ENEMY_SNIPER },
            color: COLORS.ENEMY_SNIPER,
            health: 2,
            active: true,
            facing: -1
        });
    }

    const addMine = (x: number, y: number) => {
        ents.push({
            id: `mine-${x}-${Math.random()}`,
            type: EntityType.ENEMY_MINE,
            pos: { x: x, y: y - 6 },
            vel: { x: 0, y: 0 },
            size: { ...SIZES.ENEMY_MINE },
            color: COLORS.ENEMY_MINE,
            health: 1,
            active: true,
            facing: 1
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

    // ZONE 1: THE JUNGLE
    addGround(0, 1000);
    addPowerup(400, floorY - 120, WeaponType.MACHINE_GUN); 
    addTurret(700, floorY);
    addMine(800, floorY);
    addMine(850, floorY);
    addTurret(900, floorY);

    cx = 1000;

    // ZONE 2: THE WATERFALL ASCENT
    addGround(cx, 300);
    addPlatform(cx + 350, floorY - 60, 100);
    addSniper(cx + 380, floorY - 60);
    
    addPlatform(cx + 450, floorY - 120, 100);
    addPlatform(cx + 300, floorY - 180, 150);
    addTurret(cx + 350, floorY - 180);
    
    addPlatform(cx + 500, floorY - 150, 200);
    addSniper(cx + 600, floorY - 150);
    addPowerup(cx + 600, floorY - 200, WeaponType.SPREAD);
    
    addGround(cx + 700, 400);
    addTank(cx + 900, floorY);

    cx += 1100;

    // ZONE 3: THE BRIDGE
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
    addPlatform(cx + 350, floorY - 40, 60);
    addMine(cx + 380, floorY - 40);
    
    addPlatform(cx + 450, floorY - 40, 60);
    addPlatform(cx + 550, floorY - 80, 60);
    addPowerup(cx + 560, floorY - 150, WeaponType.LASER);
    
    addBridge(cx + 700, 400, floorY - 60);
    addTurret(cx + 800, floorY - 60);
    addSniper(cx + 900, floorY - 60);

    cx += 1200;

    // ZONE 4: THE SNOW FIELD
    addGround(cx, 1000);
    addMine(cx + 200, floorY);
    addMine(cx + 250, floorY);
    addTank(cx + 400, floorY);
    addPlatform(cx + 500, floorY - 100, 200);
    addSniper(cx + 600, floorY - 100);
    addTank(cx + 800, floorY);
    
    cx += 1000;

    // ZONE 5: THE HANGAR
    addGround(cx, 800, floorY + 50);
    addPlatform(cx, floorY - 100, 800);
    addTurret(cx + 200, floorY - 100);
    addSniper(cx + 300, floorY - 100);
    addTurret(cx + 600, floorY - 100);
    addTank(cx + 500, floorY + 50);
    
    addPowerup(cx + 400, floorY, WeaponType.SPREAD);

    cx += 900;

    // ZONE 6: BOSS ARENA
    addGround(cx, 800);
    
    // BOSS
    ents.push({
        id: 'BOSS_CORE',
        type: EntityType.ENEMY_BOSS,
        pos: { x: cx + 500, y: floorY - 160 },
        vel: { x: 0, y: 0 },
        size: { ...SIZES.ENEMY_BOSS },
        color: COLORS.ENEMY_BOSS,
        health: 250,
        maxHealth: 250,
        active: true,
        facing: -1,
        bossPhase: 0
    });

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
        case 'KeyC': case 'KeyL': case 'KeyX': 
          // Check X key for Rocket
          if (e.code === 'KeyX' && !inputRef.current.rocket) {
              // Trigger Rocket Mode if available
              if (playerRef.current.active && (playerRef.current.rocketTimer || 0) <= 0) {
                 playerRef.current.rocketTimer = 360; // 6 seconds
              }
          }
          break;
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
        if (frameCountRef.current % 10 === 0) {
            spawnExplosion({ x: cameraRef.current.x + Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT }, true);
        }
        return;
    }

    frameCountRef.current++;
    const player = playerRef.current;
    const input = inputRef.current;
    const prevInput = prevInputRef.current;
    
    // --- Bullet Rain Events ---
    // Trigger 1: Mid-level (approx 2000px)
    // Trigger 2: Pre-Boss (approx 4500px)
    const px = player.pos.x;
    const rainActive = (px > 2000 && px < 2500) || (px > 4500 && px < 4900);
    
    if (rainActive && frameCountRef.current % 5 === 0) {
        // Rain Bullet
        const rainX = cameraRef.current.x + Math.random() * CANVAS_WIDTH;
        entitiesRef.current.push({
            id: `rain-${Math.random()}`,
            type: EntityType.BULLET_ENEMY,
            pos: { x: rainX, y: 0 },
            vel: { x: -1 + Math.random()*2, y: 6 + Math.random()*2 }, // Fall fast
            size: { x: 4, y: 12 },
            color: '#ff8800',
            health: 1, active: true, facing: 1,
            // Custom prop to mark as rain so it explodes on ground
            dropType: WeaponType.NORMAL 
        });
    }

    // --- Player Movement ---
    if (player.active) {
        // Rocket Mode Logic
        if ((player.rocketTimer || 0) > 0) {
            player.rocketTimer! -= 1;
            player.state = 'jump'; // Animation re-use
            player.invincibility = 2; // Invincible
            
            // Auto fly forward + control up/down
            player.vel.x = ROCKET_SPEED;
            if (input.up) player.vel.y = -4;
            else if (input.down) player.vel.y = 4;
            else player.vel.y = 0;
            
            player.pos.x += player.vel.x;
            player.pos.y += player.vel.y;
            
            // Thrust particles
            if (frameCountRef.current % 2 === 0) {
                entitiesRef.current.push({
                  id: `thrust-${Math.random()}`,
                  type: EntityType.PARTICLE,
                  pos: { x: player.pos.x, y: player.pos.y + 20 },
                  vel: { x: -4, y: Math.random()*2-1 },
                  size: { x: 4, y: 4 },
                  color: '#00ffff',
                  health: 10, active: true, facing: -1
              });
            }

        } else {
            // Normal Movement
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
        }

        // --- Shooting ---
        const isShooting = input.shoot || input.altFire;
        // Allow shooting in rocket mode too
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
          
          if ((player.rocketTimer || 0) > 0) {
              // Forced forward shooting in rocket mode
              dirY = 0; dirX = 1;
          }

          const spawnBullet = (vx: number, vy: number, angleOffset: number = 0) => {
            let spawnY = player.pos.y + 8;
            if (input.down && player.grounded) spawnY = player.pos.y + 16;
            if (input.up) spawnY = player.pos.y - 4;
            if (player.rocketTimer) spawnY = player.pos.y + 20;

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
              piercing: useLaser || (player.rocketTimer || 0) > 0, // Rocket shots pierce
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
    
    if (frameCountRef.current % SPAWN_RATE === 0 && !gameStateRef.current.gameOver) {
      const spawnX = cameraRef.current.x + CANVAS_WIDTH + 20;
      const playerX = player.pos.x;
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
      }
    }

    entitiesRef.current.forEach(e => {
      if (!e.active) return;
      
      // BOSS AI
      if (e.type === EntityType.ENEMY_BOSS) {
         e.pos.y = (CANVAS_HEIGHT - 220) + Math.sin(frameCountRef.current * 0.02) * 60;
         if (player.active) {
             const phase = frameCountRef.current % 300;
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
         }
      }
      
      // SNIPER AI
      if (e.type === EntityType.ENEMY_SNIPER) {
          if (Math.abs(e.pos.x - player.pos.x) < 500 && player.active) {
              e.facing = player.pos.x > e.pos.x ? 1 : -1;
              if (frameCountRef.current % 120 === 0) {
                  // Aim
                  const dx = player.pos.x - e.pos.x;
                  const dy = player.pos.y - e.pos.y;
                  const angle = Math.atan2(dy, dx);
                  entitiesRef.current.push({
                     id: `sbul-${Math.random()}`,
                     type: EntityType.BULLET_ENEMY,
                     pos: { x: e.pos.x + (e.facing*10), y: e.pos.y + 10 },
                     vel: { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 }, // Fast sniper shot
                     size: { x: 4, y: 4 },
                     color: '#ff0000',
                     health: 1, active: true, facing: e.facing
                  });
              }
          }
      }

      // Physics
      if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.PARTICLE || e.type === EntityType.ENEMY_TANK) {
        e.vel.y += GRAVITY;
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      } else if (e.type === EntityType.BULLET_PLAYER || e.type === EntityType.BULLET_ENEMY) {
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      }
      
      if (e.type === EntityType.POWERUP_CAPSULE) {
        e.pos.x += Math.sin(frameCountRef.current / 15) * 2;
        e.pos.y += Math.cos(frameCountRef.current / 15) * 0.5;
      }
      
      if (e.type === EntityType.PARTICLE) {
          e.health--;
          if (e.health <= 0) e.active = false;
      }
    });

    // --- Collisions ---
    if (player.active && (player.rocketTimer || 0) <= 0) {
        player.grounded = false;
        checkPlatformCollisions(player, entitiesRef.current);
    }
    
    entitiesRef.current.forEach(e => {
      if (e.type === EntityType.ENEMY_RUNNER || e.type === EntityType.ENEMY_TANK) {
        e.grounded = false;
        checkPlatformCollisions(e, entitiesRef.current);
        if (e.pos.y > CANVAS_HEIGHT + 100) e.active = false;
      }
      
      // Rain Bullets hitting floor
      if (e.type === EntityType.BULLET_ENEMY && e.dropType === WeaponType.NORMAL) {
          // Check collision with platforms
          if (e.pos.y > CANVAS_HEIGHT) e.active = false;
          else {
              entitiesRef.current.forEach(other => {
                 if (other.type === EntityType.PLATFORM || other.type === EntityType.BRIDGE) {
                     if (checkRectOverlap(e, other)) {
                         e.active = false;
                         spawnExplosion(e.pos, false);
                     }
                 } 
              });
          }
      }
    });
    
    entitiesRef.current.forEach(e => {
       if (!e.active) return;
       
       // Player Bullets
       if (e.type === EntityType.BULLET_PLAYER) {
         entitiesRef.current.forEach(target => {
            if (!target.active) return;
            const isEnemy = target.type === EntityType.ENEMY_RUNNER || target.type === EntityType.ENEMY_TURRET || target.type === EntityType.ENEMY_FLYING || target.type === EntityType.ENEMY_TANK || target.type === EntityType.ENEMY_BOSS || target.type === EntityType.ENEMY_SNIPER;
            const isPowerup = target.type === EntityType.POWERUP_CAPSULE;
            const isMine = target.type === EntityType.ENEMY_MINE;
            
            if (isEnemy || isPowerup || isMine) {
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
       
       // Player Collisions with Enemies
       if (player.active) {
           const isLethal = 
               e.type === EntityType.ENEMY_RUNNER || 
               e.type === EntityType.BULLET_ENEMY ||
               e.type === EntityType.BULLET_ROCKET ||
               e.type === EntityType.ENEMY_FLYING || 
               e.type === EntityType.ENEMY_TANK ||
               e.type === EntityType.ENEMY_BOSS ||
               e.type === EntityType.ENEMY_SNIPER ||
               e.type === EntityType.ENEMY_MINE;
               
           if (isLethal) {
              if (checkRectOverlap(e, player)) {
                 if ((player.invincibility || 0) <= 0) {
                     handlePlayerDeath();
                 }
                 if (e.type === EntityType.ENEMY_MINE) {
                     e.active = false;
                     spawnExplosion(e.pos, true);
                 }
              }
           }
           if (player.pos.y > CANVAS_HEIGHT) {
               handlePlayerDeath();
           }
       }
    });
    
    const targetX = player.pos.x - CANVAS_WIDTH / 3;
    if (targetX > cameraRef.current.x) {
      cameraRef.current.x = targetX; 
    }
    const bossWall = entitiesRef.current.find(e => e.id === 'boss-wall');
    if (bossWall && cameraRef.current.x > bossWall.pos.x - CANVAS_WIDTH + 50) {
        cameraRef.current.x = bossWall.pos.x - CANVAS_WIDTH + 50;
    }
    
    entitiesRef.current = entitiesRef.current.filter(e => {
        if (e.type === EntityType.PLATFORM || e.type === EntityType.BRIDGE || e.type === EntityType.WATER || e.type === EntityType.ENEMY_BOSS || e.id === 'boss-wall') return true;
        const margin = 500;
        const cameraLeft = cameraRef.current.x - margin;
        const cameraRight = cameraRef.current.x + CANVAS_WIDTH + margin;
        return e.active && e.pos.x > cameraLeft && e.pos.x < cameraRight;
    });
    
    prevInputRef.current = { ...input };

  }, [isPlaying, spawnExplosion, handlePlayerDeath, checkPlatformCollisions]);

  // --- RENDERING HELPERS ---
  
  const drawSoldier = (ctx: CanvasRenderingContext2D, e: GameObject) => {
      ctx.save();
      ctx.translate(Math.floor(e.pos.x + e.size.x/2), Math.floor(e.pos.y + e.size.y/2));
      ctx.scale(e.facing, 1);
      // Legs
      const walk = Math.sin(e.pos.x * 0.1) * 6;
      ctx.fillStyle = COLORS.ENEMY_UNIFORM;
      ctx.fillRect(-8, 6, 6, 16 + walk);
      ctx.fillRect(2, 6, 6, 16 - walk);
      // Body
      ctx.fillStyle = COLORS.ENEMY_UNIFORM;
      ctx.fillRect(-10, -10, 20, 20);
      // Head
      ctx.fillStyle = COLORS.ENEMY_SKIN;
      ctx.fillRect(-6, -20, 12, 10);
      // Gun
      ctx.fillStyle = '#444';
      ctx.fillRect(0, -2, 20, 6);
      ctx.restore();
  };

  const drawSniper = (ctx: CanvasRenderingContext2D, e: GameObject) => {
      ctx.save();
      ctx.translate(Math.floor(e.pos.x + e.size.x/2), Math.floor(e.pos.y + e.size.y/2));
      ctx.scale(e.facing, 1);
      // Crouch Body
      ctx.fillStyle = COLORS.ENEMY_SNIPER;
      ctx.fillRect(-12, 0, 24, 16);
      // Head
      ctx.fillStyle = COLORS.ENEMY_SKIN;
      ctx.fillRect(-6, -10, 12, 10);
      // Helmet
      ctx.fillStyle = '#400';
      ctx.fillRect(-7, -12, 14, 4);
      // Rifle
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 2, 24, 4);
      ctx.restore();
  };

  const drawTank = (ctx: CanvasRenderingContext2D, e: GameObject) => {
      ctx.save();
      ctx.translate(Math.floor(e.pos.x), Math.floor(e.pos.y));
      // Treads
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 32, 64, 8);
      // Tread details
      ctx.fillStyle = '#333';
      const treadOffset = Math.floor(frameCountRef.current % 16);
      for(let i=0; i<64; i+=16) {
          ctx.fillRect(i + treadOffset - 8, 32, 4, 8);
      }
      // Body
      ctx.fillStyle = COLORS.ENEMY_TANK;
      ctx.fillRect(4, 12, 56, 20);
      // Turret
      ctx.fillStyle = '#004400';
      ctx.fillRect(16, 0, 32, 12);
      // Barrel
      ctx.fillStyle = '#000';
      const facing = e.facing || -1;
      if (facing === 1) ctx.fillRect(48, 4, 24, 6);
      else ctx.fillRect(-8, 4, 24, 6);
      ctx.restore();
  };

  const drawMine = (ctx: CanvasRenderingContext2D, e: GameObject) => {
      ctx.save();
      ctx.translate(Math.floor(e.pos.x), Math.floor(e.pos.y));
      ctx.fillStyle = COLORS.ENEMY_MINE;
      ctx.beginPath();
      ctx.arc(10, 4, 8, Math.PI, 0); // Semi circle
      ctx.fill();
      // Blink light
      if (frameCountRef.current % 30 < 15) {
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(10, 0, 3, 0, Math.PI*2);
          ctx.fill();
      }
      ctx.restore();
  };

  const drawRocketPlayer = (ctx: CanvasRenderingContext2D, p: GameObject) => {
      ctx.save();
      ctx.translate(Math.floor(p.pos.x + p.size.x/2), Math.floor(p.pos.y + p.size.y/2));
      // Rocket rotation
      ctx.rotate(0.2); // Slight tile up
      // Flame
      if (frameCountRef.current % 4 < 2) {
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.moveTo(-20, 0);
          ctx.lineTo(-40, -10);
          ctx.lineTo(-40, 10);
          ctx.fill();
      }
      // Body
      ctx.fillStyle = '#0058f8'; // Blue
      ctx.fillRect(-20, -10, 40, 20);
      // Cone
      ctx.fillStyle = '#ccc';
      ctx.beginPath();
      ctx.moveTo(20, -10);
      ctx.lineTo(40, 0);
      ctx.lineTo(20, 10);
      ctx.fill();
      // Fins
      ctx.fillStyle = '#f83800';
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.lineTo(-20, -20); ctx.lineTo(0, -10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-10, 10); ctx.lineTo(-20, 20); ctx.lineTo(0, 10);
      ctx.fill();
      ctx.restore();
  }

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
         ctx.fillText('X KEY .......... ROCKET MODE', instrX, instrY); instrY += 25;
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
         
         if (e.type === EntityType.WATER) {
             ctx.globalAlpha = 0.8;
             ctx.fillStyle = COLORS.WATER_DEEP;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             ctx.fillStyle = COLORS.WATER_SURFACE;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, 10);
             ctx.globalAlpha = 1.0;
         } else if (e.type === EntityType.ENEMY_TURRET) {
             ctx.fillStyle = COLORS.TURRET_BASE;
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
         } else if (e.type === EntityType.ENEMY_RUNNER) {
             drawSoldier(ctx, e);
         } else if (e.type === EntityType.ENEMY_SNIPER) {
             drawSniper(ctx, e);
         } else if (e.type === EntityType.ENEMY_TANK) {
             drawTank(ctx, e);
         } else if (e.type === EntityType.ENEMY_MINE) {
             drawMine(ctx, e);
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
             ctx.fillStyle = '#aa0000';
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
             ctx.fillStyle = e.color;
             if (e.piercing) {
                ctx.save();
                ctx.translate(e.pos.x, e.pos.y);
                ctx.rotate(e.angle || 0);
                ctx.fillRect(0, -2, e.size.x, e.size.y);
                ctx.restore();
             } else {
                ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
             }
         } else if (e.type === EntityType.BULLET_ENEMY) {
             ctx.fillStyle = e.color;
             ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
         } else if (e.type === EntityType.PARTICLE) {
             ctx.fillStyle = e.color;
             ctx.beginPath();
             ctx.arc(e.pos.x, e.pos.y, e.size.x, 0, Math.PI*2);
             ctx.fill();
         } else if (e.type === EntityType.PLATFORM || e.type === EntityType.BRIDGE) {
             // Platforms - Mario/Contra Style Solid Blocks
             if (!e.isBridge) {
                 // Solid fill
                 ctx.fillStyle = COLORS.GROUND_TOP;
                 ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
                 
                 // Texture Pattern
                 ctx.fillStyle = '#000000';
                 ctx.globalAlpha = 0.2;
                 ctx.strokeRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
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
                 // Bridge
                 ctx.fillStyle = '#fc9838';
                 ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
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
         if ((p.rocketTimer || 0) > 0) {
             drawRocketPlayer(ctx, p);
         } else {
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
     if ((playerRef.current.rocketTimer || 0) > 0) {
         ctx.fillStyle = '#00ffff';
         ctx.fillText(`ROCKET: ${(playerRef.current.rocketTimer!/60).toFixed(1)}`, 160, 55);
     }
     ctx.fillStyle = COLORS.HUD_TEXT;
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
