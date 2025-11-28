
export const CANVAS_WIDTH = 512; // 2x NES width
export const CANVAS_HEIGHT = 480; // 2x NES height
export const GRAVITY = 0.5;
export const PLAYER_SPEED = 3.5;
export const ROCKET_SPEED = 8.0;
export const JUMP_FORCE = 11;
export const BULLET_SPEED = 10;
export const ENEMY_SPEED = 2;
export const SPAWN_RATE = 100; 

// NES Contra Palette Approximation
export const COLORS = {
  // Player
  PLAYER_SKIN: '#f8b800',
  PLAYER_PANTS: '#0058f8', // Blue pants P1
  PLAYER_BANDANA: '#f83800',
  
  // Environment
  SKY: '#000000',
  GROUND_TOP: '#6888fc', // Jungle metal/grass mix
  GROUND_SIDE: '#005800',
  WATER_SURFACE: '#38b8f8',
  WATER_DEEP: '#0000bc',
  BRIDGE: '#fc9838',
  
  // Enemies
  ENEMY_SKIN: '#f8b800',
  ENEMY_UNIFORM: '#b80000', // Red Falcon
  ENEMY_FLYING: '#f83800', // Red flying capsule
  ENEMY_TANK: '#008800',   // Green Tank
  ENEMY_BOSS: '#e40058',   // Pink/Red Boss
  ENEMY_SNIPER: '#880000', // Dark Red
  ENEMY_MINE: '#555555',
  TURRET_BASE: '#7c7c7c',
  TURRET_GUN: '#bcbcbc',
  
  // Projectiles
  BULLET_PLAYER: '#ffffff', // White/Orange pulse
  BULLET_LASER: '#ff00ff',  // Electric Blue/Purple
  BULLET_MG: '#ffff00',     // Yellow
  BULLET_ENEMY: '#f83800',  // Red glow
  BULLET_ROCKET: '#ffffff',
  
  // UI
  HUD_TEXT: '#ffffff'
};

export const SIZES = {
  PLAYER: { x: 20, y: 44 }, // Taller, thinner for Contra ratio
  ENEMY_RUNNER: { x: 24, y: 44 },
  ENEMY_SNIPER: { x: 24, y: 34 }, // Crouching
  ENEMY_TURRET: { x: 32, y: 32 },
  ENEMY_FLYING: { x: 24, y: 24 },
  ENEMY_TANK: { x: 64, y: 40 },
  ENEMY_BOSS: { x: 140, y: 160 },
  ENEMY_MINE: { x: 20, y: 8 },
  BULLET: { x: 6, y: 6 },
  SPREAD_BULLET: { x: 8, y: 8 },
  LASER_BULLET: { x: 24, y: 6 },
  ROCKET: { x: 16, y: 8 },
  POWERUP: { x: 24, y: 16 }
};
