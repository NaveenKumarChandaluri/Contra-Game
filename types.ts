
export enum EntityType {
  PLAYER,
  ENEMY_RUNNER,
  ENEMY_TURRET,
  ENEMY_FLYING,
  ENEMY_TANK,
  ENEMY_BOSS,
  BULLET_PLAYER,
  BULLET_ENEMY,
  BULLET_ROCKET,
  PARTICLE,
  PLATFORM,
  WATER,
  POWERUP_CAPSULE,
  BRIDGE
}

export enum WeaponType {
  NORMAL,
  SPREAD,
  LASER,
  MACHINE_GUN
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  type: EntityType;
  pos: Vector2;
  vel: Vector2;
  size: Vector2;
  color: string;
  health: number;
  active: boolean;
  facing: 1 | -1; // 1 = right, -1 = left
  state?: string; // 'idle', 'run', 'jump', 'duck', 'swim', 'TEXT_POPUP'
  frameTimer?: number;
  frameIndex?: number;
  grounded?: boolean;
  cooldown?: number; // Weapon cooldown
  
  // Specific properties
  invincibility?: number; // Damage invincibility frames
  jumpCount?: number; // Track jumps
  weaponType?: WeaponType;
  dropType?: WeaponType; // For powerups
  piercing?: boolean; // For lasers
  text?: string; // For floating text particles
  isBridge?: boolean; 
  isTurret?: boolean;
  angle?: number; // For turret aiming or rotating jump
  initialY?: number; // For flying enemies sine wave
  
  // Boss props
  bossPhase?: number;
  maxHealth?: number;
}

export interface GameState {
  score: number;
  lives: number;
  gameOver: boolean;
  gameWon: boolean;
  highScore: number;
}

export type InputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  shoot: boolean;
  altFire: boolean;
};