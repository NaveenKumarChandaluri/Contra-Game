export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 450;
export const GRAVITY = 0.6;
export const FRICTION = 0.8;
export const PLAYER_SPEED = 4;
export const JUMP_FORCE = 12;
export const BULLET_SPEED = 12;
export const ENEMY_SPEED = 2;
export const SPAWN_RATE = 120; // Frames

// Colors
export const COLORS = {
  PLAYER_SKIN: '#ffccaa',
  PLAYER_PANTS: '#2255ff',
  PLAYER_BANDANA: '#ff2222',
  ENEMY_SKIN: '#ccaa88',
  ENEMY_UNIFORM: '#228822',
  GROUND_TOP: '#55aa55',
  GROUND_SIDE: '#336633',
  SKY: '#111',
  BULLET_PLAYER: '#ffff00',
  BULLET_ENEMY: '#ff5500',
};

// Hitboxes
export const SIZES = {
  PLAYER: { x: 24, y: 48 },
  ENEMY_RUNNER: { x: 24, y: 48 },
  ENEMY_TURRET: { x: 32, y: 32 },
  BULLET: { x: 6, y: 6 },
};