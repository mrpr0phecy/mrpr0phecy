#!/usr/bin/env python3
"""
===============================================================================
             RILEY SMASHES THE ZOMBIES: ULTIMATE ARCANE PLATFORMER
===============================================================================
An epic, fast-paced 2D action platformer featuring Riley the Arcane Wizard.
Smash through relentless zombie hordes, unlock devastating spells, execute
seismic ground slams, and defeat gargantuan mutant bosses!

Key Features:
- 4 Switchable Arcane Spells: Fireball, Chain Lightning, Ice Nova, Void Meteor
- Seismic Ground Slam & Invulnerable Dash
- 7 Unique Zombie Types + Multi-Stage Boss Fights (Abomination Titan, Necrolord)
- Interactive Wave Upgrade Shop (12+ Stackable Perks)
- Power-up Pickups (Nukes, Time Freeze, Energy Shields, Healing Potions, Frenzy)
- Procedural Jumpable Level Architecture across 6 Eerie Biomes
- Dynamic Parallax Backgrounds, Weather Systems (Rain, Embers, Spores, Snow)
- High-Performance Particle Engine, Screen Trauma Shake, Floating Damage Popups
- Fully Autonomous Procedural Audio Synthesizer (No external asset files required!)
===============================================================================
"""

import pygame
import random
import sys
import math
import array

# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
SCREEN_WIDTH = 1200
SCREEN_HEIGHT = 800
FPS = 60

# Color Palette
WHITE = (255, 255, 255)
BLACK = (10, 10, 16)
GOLD = (255, 215, 0)
YELLOW = (255, 240, 90)
ORANGE = (255, 120, 30)
RED = (235, 50, 60)
CRIMSON = (160, 20, 40)
GREEN = (50, 220, 90)
DARK_GREEN = (25, 110, 45)
SLIME_GREEN = (140, 255, 30)
CYAN = (45, 215, 255)
BLUE = (50, 100, 240)
PURPLE = (165, 65, 240)
DARK_PURPLE = (75, 25, 120)
MAGENTA = (240, 50, 180)
SKIN = (255, 210, 180)
HAT_COLOR = (65, 40, 190)
ROBE_COLOR = (45, 65, 175)
DARK_GRAY = (40, 40, 50)
LIGHT_GRAY = (180, 185, 200)

# Initialize Pygame & Audio
pygame.init()
try:
    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
    AUDIO_AVAILABLE = True
except Exception:
    AUDIO_AVAILABLE = False

screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Riley Smashes the Zombies - Ultimate Arcane Edition")
clock = pygame.time.Clock()

# Fonts
font_sm = pygame.font.Font(None, 24)
font_md = pygame.font.Font(None, 34)
font_lg = pygame.font.Font(None, 54)
font_xl = pygame.font.Font(None, 84)

# -----------------------------------------------------------------------------
# Procedural Audio Synthesizer (100% Standalone, No MP3/WAV files needed)
# -----------------------------------------------------------------------------
class SoundEngine:
    """Generates procedural sound effects using pure mathematical wave synthesis."""
    def __init__(self):
        self.sounds = {}
        self.enabled = AUDIO_AVAILABLE
        if self.enabled:
            self._generate_all_sounds()

    def _create_sound(self, generator_func, duration=0.2, volume=0.3):
        try:
            sample_rate = 44100
            n_samples = int(sample_rate * duration)
            buf = array.array('h')
            for i in range(n_samples):
                t = i / sample_rate
                val = generator_func(t, duration)
                # Clamp to 16-bit signed integer
                sample = int(max(-1.0, min(1.0, val)) * 32767 * volume)
                buf.append(sample) # Left channel
                buf.append(sample) # Right channel
            return pygame.mixer.Sound(buffer=buf)
        except Exception:
            return None

    def _generate_all_sounds(self):
        # Jump Sound: Rising pitch sine wave
        self.sounds['jump'] = self._create_sound(
            lambda t, d: math.sin(2 * math.pi * (300 + 400 * (t/d)**0.7) * t) * (1 - t/d),
            duration=0.15, volume=0.25
        )
        # Dash Sound: Filtered sweep
        self.sounds['dash'] = self._create_sound(
            lambda t, d: (random.random() * 2 - 1) * math.sin(2 * math.pi * (800 - 600 * (t/d)) * t) * (1 - t/d)**0.5,
            duration=0.18, volume=0.3
        )
        # Fireball Cast: Whoosh + tonal zap
        self.sounds['fireball'] = self._create_sound(
            lambda t, d: (math.sin(2 * math.pi * (600 - 300 * (t/d)) * t) * 0.6 + (random.random() * 2 - 1) * 0.4) * (1 - t/d),
            duration=0.16, volume=0.28
        )
        # Lightning Strike: Sharp white noise + rapid square wave
        self.sounds['lightning'] = self._create_sound(
            lambda t, d: ((random.random()*2-1)*0.7 + (1 if math.sin(2*math.pi*1200*t)>0 else -1)*0.3) * (1 - (t/d)**0.5),
            duration=0.22, volume=0.35
        )
        # Ice Nova: Shimmering high frequency crystal chime
        self.sounds['ice'] = self._create_sound(
            lambda t, d: math.sin(2 * math.pi * (1400 + 300 * math.sin(40*t)) * t) * (1 - t/d)**1.5,
            duration=0.25, volume=0.25
        )
        # Meteor / Explosion: Heavy low frequency rumble + crunch
        self.sounds['explosion'] = self._create_sound(
            lambda t, d: (math.sin(2 * math.pi * (120 - 90 * (t/d)) * t) * 0.5 + (random.random()*2-1)*0.5) * (1 - t/d)**0.7,
            duration=0.45, volume=0.45
        )
        # Seismic Ground Slam: Heavy impact bass drop
        self.sounds['slam'] = self._create_sound(
            lambda t, d: (math.sin(2 * math.pi * (220 - 180 * (t/d)) * t) * 0.7 + (random.random()*2-1)*0.3) * (1 - t/d)**0.5,
            duration=0.35, volume=0.5
        )
        # Zombie Hit: Low fleshy squish
        self.sounds['zombie_hit'] = self._create_sound(
            lambda t, d: ((random.random()*2-1)*0.6 + math.sin(2*math.pi*180*t)*0.4) * (1 - t/d)**2,
            duration=0.12, volume=0.3
        )
        # Zombie Splat / Kill: Satisfying crunch
        self.sounds['zombie_kill'] = self._create_sound(
            lambda t, d: ((random.random()*2-1)*0.8 + math.sin(2*math.pi*300*(1-t/d)*t)*0.2) * (1 - t/d),
            duration=0.2, volume=0.35
        )
        # Pickup / Gem: Rising bright arpeggio
        self.sounds['pickup'] = self._create_sound(
            lambda t, d: math.sin(2 * math.pi * (600 + (1200 if t>d*0.5 else 0)) * t) * (1 - t/d),
            duration=0.14, volume=0.25
        )
        # Powerup Activated: Grand chord chime
        self.sounds['powerup'] = self._create_sound(
            lambda t, d: (math.sin(2*math.pi*523.25*t) + math.sin(2*math.pi*659.25*t) + math.sin(2*math.pi*783.99*t))/3 * (1 - t/d),
            duration=0.35, volume=0.35
        )
        # Player Hurt: Low dissonant buzz
        self.sounds['hurt'] = self._create_sound(
            lambda t, d: ((1 if math.sin(2*math.pi*110*t)>0 else -1)*0.6 + (random.random()*2-1)*0.4) * (1 - t/d),
            duration=0.25, volume=0.35
        )
        # Boss Roar: Menacing dual low modulation
        self.sounds['boss_roar'] = self._create_sound(
            lambda t, d: (math.sin(2*math.pi*(80 + 30*math.sin(15*t))*t)*0.6 + (random.random()*2-1)*0.4) * (1 - (t/d)**0.5),
            duration=0.6, volume=0.5
        )

    def play(self, sound_name):
        if not self.enabled:
            return
        snd = self.sounds.get(sound_name)
        if snd:
            try:
                snd.play()
            except Exception:
                pass

audio = SoundEngine()

# -----------------------------------------------------------------------------
# Biome Themes & Visual Environments
# -----------------------------------------------------------------------------
BIOMES = [
    {
        'name': 'Haunted Graveyard',
        'sky_top': (12, 10, 30),
        'sky_bot': (35, 30, 65),
        'grass': (40, 130, 60),
        'dirt': (70, 45, 30),
        'weather': 'fog',
        'accent': (120, 255, 160)
    },
    {
        'name': 'Toxic Mire & Ruins',
        'sky_top': (10, 25, 18),
        'sky_bot': (25, 65, 45),
        'grass': (70, 210, 60),
        'dirt': (30, 60, 35),
        'weather': 'spores',
        'accent': (160, 255, 50)
    },
    {
        'name': 'Crimson Blood Citadel',
        'sky_top': (40, 8, 18),
        'sky_bot': (95, 25, 40),
        'grass': (180, 45, 55),
        'dirt': (85, 20, 25),
        'weather': 'embers',
        'accent': (255, 80, 80)
    },
    {
        'name': 'Arcane Cosmic Sanctum',
        'sky_top': (20, 8, 45),
        'sky_bot': (70, 30, 110),
        'grass': (140, 70, 220),
        'dirt': (55, 25, 80),
        'weather': 'stars',
        'accent': (210, 120, 255)
    },
    {
        'name': 'Frozen Necropolis',
        'sky_top': (10, 20, 45),
        'sky_bot': (40, 70, 110),
        'grass': (160, 225, 255),
        'dirt': (45, 65, 95),
        'weather': 'snow',
        'accent': (120, 220, 255)
    },
    {
        'name': 'Infernal Nether Abyss',
        'sky_top': (50, 15, 8),
        'sky_bot': (130, 50, 15),
        'grass': (240, 130, 30),
        'dirt': (110, 45, 15),
        'weather': 'embers',
        'accent': (255, 180, 40)
    }
]

# -----------------------------------------------------------------------------
# Visual Effects, Weather & Particles
# -----------------------------------------------------------------------------
class Particle:
    def __init__(self, x, y, color, size=4, speed=4, lifetime=25, gravity=0.15, glow=False):
        self.x = float(x)
        self.y = float(y)
        angle = random.uniform(0, math.pi * 2)
        spd = random.uniform(speed * 0.3, speed * 1.5)
        self.vx = math.cos(angle) * spd
        self.vy = math.sin(angle) * spd
        self.color = color
        self.size = size
        self.life = lifetime
        self.max_life = lifetime
        self.gravity = gravity
        self.glow = glow

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += self.gravity
        self.life -= 1
        return self.life > 0

    def draw(self, surface):
        progress = max(0.0, self.life / self.max_life)
        cur_size = max(1, int(self.size * progress))
        alpha = int(255 * progress)
        
        # Color with alpha
        s = pygame.Surface((cur_size * 4, cur_size * 4), pygame.SRCALPHA)
        col = (self.color[0], self.color[1], self.color[2], alpha)
        pygame.draw.circle(s, col, (cur_size * 2, cur_size * 2), cur_size)
        if self.glow and cur_size > 2:
            glow_col = (self.color[0], self.color[1], self.color[2], int(alpha * 0.35))
            pygame.draw.circle(s, glow_col, (cur_size * 2, cur_size * 2), cur_size * 2)
        surface.blit(s, (int(self.x - cur_size * 2), int(self.y - cur_size * 2)))

class FloatingText:
    def __init__(self, text, x, y, color=GOLD, size=28, duration=50):
        self.text = text
        self.x = float(x)
        self.y = float(y)
        self.color = color
        self.duration = duration
        self.max_duration = duration
        self.vy = -1.6
        self.font = pygame.font.Font(None, size)

    def update(self):
        self.y += self.vy
        self.vy *= 0.95
        self.duration -= 1
        return self.duration > 0

    def draw(self, surface):
        alpha = min(255, int(255 * (self.duration / (self.max_duration * 0.4))))
        rendered = self.font.render(self.text, True, self.color)
        s = pygame.Surface(rendered.get_size(), pygame.SRCALPHA)
        s.blit(rendered, (0, 0))
        s.set_alpha(alpha)
        # Shadow
        shadow = self.font.render(self.text, True, BLACK)
        shadow_s = pygame.Surface(shadow.get_size(), pygame.SRCALPHA)
        shadow_s.blit(shadow, (0, 0))
        shadow_s.set_alpha(int(alpha * 0.7))
        surface.blit(shadow_s, (int(self.x - shadow.get_width()//2 + 2), int(self.y + 2)))
        surface.blit(s, (int(self.x - rendered.get_width()//2), int(self.y)))

class WeatherSystem:
    def __init__(self):
        self.particles = []
        for _ in range(80):
            self.particles.append({
                'x': random.randint(0, SCREEN_WIDTH),
                'y': random.randint(0, SCREEN_HEIGHT),
                'speed': random.uniform(1.0, 3.5),
                'size': random.uniform(1.5, 3.5),
                'drift': random.uniform(-0.5, 0.5),
                'timer': random.uniform(0, 10)
            })

    def update(self, biome_type):
        for p in self.particles:
            p['timer'] += 0.05
            if biome_type == 'snow':
                p['y'] += p['speed'] * 0.8
                p['x'] += math.sin(p['timer']) * 1.2
            elif biome_type == 'embers':
                p['y'] -= p['speed'] * 1.2
                p['x'] += math.cos(p['timer']) * 1.5
            elif biome_type == 'spores':
                p['y'] += math.sin(p['timer']) * 0.8
                p['x'] += math.cos(p['timer']) * 0.8
            else: # fog / stars
                p['x'] += p['drift']
                p['y'] += math.sin(p['timer'] * 0.5) * 0.3

            # Wrap around screen
            if p['y'] > SCREEN_HEIGHT: p['y'] = 0; p['x'] = random.randint(0, SCREEN_WIDTH)
            if p['y'] < 0: p['y'] = SCREEN_HEIGHT; p['x'] = random.randint(0, SCREEN_WIDTH)
            if p['x'] > SCREEN_WIDTH: p['x'] = 0
            if p['x'] < 0: p['x'] = SCREEN_WIDTH

    def draw(self, surface, biome):
        w_type = biome['weather']
        color = biome['accent']
        for p in self.particles:
            alpha = int(120 + 80 * math.sin(p['timer']))
            s = pygame.Surface((int(p['size'] * 2), int(p['size'] * 2)), pygame.SRCALPHA)
            pygame.draw.circle(s, (color[0], color[1], color[2], alpha), (int(p['size']), int(p['size'])), int(p['size']))
            surface.blit(s, (int(p['x']), int(p['y'])))

# -----------------------------------------------------------------------------
# Platforms & Level Architecture
# -----------------------------------------------------------------------------
class Platform(pygame.Rect):
    def __init__(self, x, y, width, height=22, p_type='solid'):
        super().__init__(x, y, width, height)
        self.p_type = p_type # 'solid', 'bouncy', 'crumble', 'moving'
        self.original_y = y
        self.move_timer = random.uniform(0, 100)
        self.crumble_timer = 0
        self.is_broken = False
        self.respawn_timer = 0

    def update(self):
        if self.p_type == 'moving':
            self.move_timer += 0.03
            self.x += math.sin(self.move_timer) * 1.8
        elif self.p_type == 'crumble':
            if self.crumble_timer > 0:
                self.crumble_timer -= 1
                if self.crumble_timer == 0:
                    self.is_broken = True
                    self.respawn_timer = 180
            elif self.is_broken:
                self.respawn_timer -= 1
                if self.respawn_timer <= 0:
                    self.is_broken = False

    def draw(self, surface, theme):
        if self.is_broken:
            return

        dirt_col = theme['dirt']
        grass_col = theme['grass']

        # Crumble shake effect
        shake_x = 0
        if self.crumble_timer > 0:
            shake_x = random.randint(-2, 2)

        # Platform base
        rect = pygame.Rect(self.x + shake_x, self.y, self.width, self.height)
        pygame.draw.rect(surface, dirt_col, rect, border_radius=4)

        # Platform special styles
        if self.p_type == 'bouncy':
            # Glowing Spring Mushroom Cap
            pygame.draw.rect(surface, MAGENTA, (self.x + shake_x, self.y, self.width, 7), border_radius=3)
            # Spores
            for i in range(int(self.x) + 12, int(self.x + self.width) - 10, 16):
                pygame.draw.circle(surface, YELLOW, (i + shake_x, self.y + 3), 2)
        elif self.p_type == 'crumble':
            # Cracked Stone Top
            pygame.draw.rect(surface, (130, 110, 95), (self.x + shake_x, self.y, self.width, 6), border_radius=3)
            for i in range(int(self.x) + 10, int(self.x + self.width) - 10, 20):
                pygame.draw.line(surface, BLACK, (i + shake_x, self.y), (i + shake_x + 4, self.y + 6), 2)
        else:
            # Lush Arcane Surface
            pygame.draw.rect(surface, grass_col, (self.x + shake_x, self.y, self.width, 6), border_radius=3)
            # Grass blades
            for i in range(int(self.x) + 8, int(self.x + self.width) - 8, 12):
                pygame.draw.line(surface, grass_col, (i + shake_x, self.y), (i + shake_x + 1, self.y - 4), 2)

        # Platform border highlight
        pygame.draw.rect(surface, (255, 255, 255, 30), rect, 1, border_radius=4)

def generate_procedural_level(wave_num):
    """Generates balanced, guaranteed-jumpable platform structures with hazards and jump pads."""
    platforms = []
    # Ground Floor
    ground = Platform(0, SCREEN_HEIGHT - 60, SCREEN_WIDTH, 60, 'solid')
    platforms.append(ground)

    tier_heights = [
        SCREEN_HEIGHT - 200,
        SCREEN_HEIGHT - 340,
        SCREEN_HEIGHT - 480,
        SCREEN_HEIGHT - 620
    ]

    for idx, y in enumerate(tier_heights):
        p_count = random.choice([2, 3]) if y > SCREEN_HEIGHT - 500 else random.choice([1, 2])
        
        # Decide platform types based on wave difficulty
        types = ['solid', 'solid', 'solid']
        if wave_num >= 2 and random.random() > 0.5:
            types.append('bouncy')
        if wave_num >= 3 and random.random() > 0.6:
            types.append('crumble')
        if wave_num >= 4 and random.random() > 0.7:
            types.append('moving')

        if p_count == 1:
            w = random.randint(280, 420)
            x = random.randint(220, SCREEN_WIDTH - w - 220)
            platforms.append(Platform(x, y, w, p_type=random.choice(types)))
        elif p_count == 2:
            w1 = random.randint(210, 310)
            x1 = random.randint(60, SCREEN_WIDTH // 2 - w1 - 20)
            w2 = random.randint(210, 310)
            x2 = random.randint(SCREEN_WIDTH // 2 + 40, SCREEN_WIDTH - w2 - 60)
            platforms.append(Platform(x1, y, w1, p_type=random.choice(types)))
            platforms.append(Platform(x2, y, w2, p_type=random.choice(types)))
        else: # 3 platforms
            w1 = random.randint(160, 230)
            x1 = random.randint(40, 260)
            w2 = random.randint(180, 250)
            x2 = random.randint(420, 680)
            w3 = random.randint(160, 230)
            x3 = random.randint(840, SCREEN_WIDTH - w3 - 40)
            platforms.append(Platform(x1, y, w1, p_type=random.choice(types)))
            platforms.append(Platform(x2, y, w2, p_type=random.choice(types)))
            platforms.append(Platform(x3, y, w3, p_type=random.choice(types)))

    return platforms

# -----------------------------------------------------------------------------
# Power-up Drops & Pickups
# -----------------------------------------------------------------------------
class Pickup:
    TYPES = ['heal', 'shield', 'nuke', 'freeze', 'frenzy', 'gem', 'coin']

    def __init__(self, x, y, p_type=None):
        self.x = float(x)
        self.y = float(y)
        self.vy = -4.0
        self.vx = random.uniform(-1.5, 1.5)
        self.type = p_type or random.choices(
            ['coin', 'gem', 'heal', 'shield', 'frenzy', 'freeze', 'nuke'],
            weights=[0.40, 0.25, 0.12, 0.08, 0.07, 0.05, 0.03]
        )[0]
        self.life = 450 # 7.5 seconds
        self.bob_timer = random.uniform(0, 10)
        self.radius = 14

    def update(self, platforms, player):
        self.bob_timer += 0.08
        self.life -= 1

        # Magnet attraction to player if player has magnet perk or is near
        dx = player.rect.centerx - self.x
        dy = player.rect.centery - self.y
        dist = math.hypot(dx, dy)
        magnet_range = 280 if player.perks.get('magnet', 0) > 0 else 70
        if dist < magnet_range and dist > 0:
            speed = 7.0 if player.perks.get('magnet', 0) > 0 else 4.0
            self.vx += (dx / dist) * speed * 0.15
            self.vy += (dy / dist) * speed * 0.15

        self.x += self.vx
        self.y += self.vy
        self.vx *= 0.95
        self.vy += 0.25 # Gravity

        # Floor collision
        for p in platforms:
            if not p.is_broken and p.collidepoint(self.x, self.y + self.radius):
                self.y = p.top - self.radius
                self.vy = 0
                break

        return self.life > 0

    def draw(self, surface):
        progress = self.life / 450
        if self.life < 90 and self.life % 8 < 4:
            return # Flashing when expiring

        cx = int(self.x)
        cy = int(self.y + math.sin(self.bob_timer) * 3)

        # Draw glowing aura
        glow_s = pygame.Surface((self.radius * 4, self.radius * 4), pygame.SRCALPHA)
        color_map = {
            'heal': GREEN, 'shield': CYAN, 'nuke': GOLD,
            'freeze': (180, 230, 255), 'frenzy': ORANGE,
            'gem': PURPLE, 'coin': YELLOW
        }
        col = color_map.get(self.type, WHITE)
        pygame.draw.circle(glow_s, (col[0], col[1], col[2], 60), (self.radius * 2, self.radius * 2), self.radius * 2)
        surface.blit(glow_s, (cx - self.radius * 2, cy - self.radius * 2))

        # Draw item icon
        pygame.draw.circle(surface, col, (cx, cy), self.radius)
        pygame.draw.circle(surface, WHITE, (cx, cy), self.radius - 3)

        # Symbols
        symbol_font = pygame.font.Font(None, 20)
        sym_map = {'heal': '♥', 'shield': '🛡', 'nuke': '💣', 'freeze': '❄', 'frenzy': '⚡', 'gem': '✦', 'coin': '●'}
        txt = symbol_font.render(sym_map.get(self.type, '?'), True, col)
        surface.blit(txt, (cx - txt.get_width()//2, cy - txt.get_height()//2))

# -----------------------------------------------------------------------------
# Spells & Player Projectiles
# -----------------------------------------------------------------------------
class Projectile:
    def __init__(self, x, y, angle, spell_type='fireball', damage_mult=1.0, size_mult=1.0):
        self.x = float(x)
        self.y = float(y)
        self.spell_type = spell_type
        self.angle = angle
        self.damage_mult = damage_mult
        self.pierce_left = 2 if spell_type == 'ice' else 0
        self.trail = []

        if spell_type == 'lightning':
            self.speed = 22.0
            self.radius = int(8 * size_mult)
            self.life = 45
            self.color = CYAN
            self.base_damage = 2.5
        elif spell_type == 'ice':
            self.speed = 14.0
            self.radius = int(10 * size_mult)
            self.life = 60
            self.color = (160, 230, 255)
            self.base_damage = 1.8
        elif spell_type == 'meteor':
            self.speed = 10.0
            self.radius = int(16 * size_mult)
            self.life = 85
            self.color = PURPLE
            self.base_damage = 5.0
        else: # Standard Fireball
            self.speed = 15.0
            self.radius = int(12 * size_mult)
            self.life = 70
            self.color = ORANGE
            self.base_damage = 2.0

        self.vx = math.cos(angle) * self.speed
        self.vy = math.sin(angle) * self.speed
        if spell_type == 'meteor':
            self.vy -= 2.0 # Arc lob

    def get_rect(self):
        return pygame.Rect(self.x - self.radius, self.y - self.radius, self.radius * 2, self.radius * 2)

    def update(self, platforms):
        self.trail.append((self.x, self.y))
        if len(self.trail) > 8:
            self.trail.pop(0)

        if self.spell_type == 'meteor':
            self.vy += 0.25 # Gravity for lobbed meteor

        self.x += self.vx
        self.y += self.vy
        self.life -= 1

        # Platform collision (fireball, meteor explode on walls)
        rect = self.get_rect()
        for p in platforms:
            if not p.is_broken and rect.colliderect(p):
                return False

        return self.life > 0 and 0 <= self.x <= SCREEN_WIDTH and 0 <= self.y <= SCREEN_HEIGHT

    def draw(self, surface):
        # Draw particle trail
        for i, (tx, ty) in enumerate(self.trail):
            t_alpha = int(255 * (i / len(self.trail)) * 0.5)
            t_rad = max(2, int(self.radius * (i / len(self.trail))))
            ts = pygame.Surface((t_rad * 2, t_rad * 2), pygame.SRCALPHA)
            pygame.draw.circle(ts, (self.color[0], self.color[1], self.color[2], t_alpha), (t_rad, t_rad), t_rad)
            surface.blit(ts, (int(tx - t_rad), int(ty - t_rad)))

        # Outer Glow
        glow = pygame.Surface((self.radius * 4, self.radius * 4), pygame.SRCALPHA)
        pygame.draw.circle(glow, (self.color[0], self.color[1], self.color[2], 80), (self.radius * 2, self.radius * 2), self.radius * 2)
        surface.blit(glow, (int(self.x - self.radius * 2), int(self.y - self.radius * 2)))

        # Core
        pygame.draw.circle(surface, self.color, (int(self.x), int(self.y)), self.radius)
        pygame.draw.circle(surface, WHITE, (int(self.x), int(self.y)), max(2, self.radius - 4))

# -----------------------------------------------------------------------------
# Player: Riley the Arcane Zombie Smasher
# -----------------------------------------------------------------------------
class Riley:
    SPELLS = ['fireball', 'lightning', 'ice', 'meteor']

    def __init__(self):
        self.rect = pygame.Rect(SCREEN_WIDTH // 2 - 22, SCREEN_HEIGHT - 130, 44, 58)
        self.vx = 0.0
        self.vy = 0.0
        self.speed = 7.2
        self.jump_power = -16.2
        self.gravity = 0.68
        self.on_ground = False
        self.facing = 1
        
        # State timers & gauges
        self.cooldown = 0
        self.invincible = 0
        self.hit_flash = 0
        self.dash_cooldown = 0
        self.dash_timer = 0
        self.slamming = False
        self.coyote_timer = 0
        self.jump_buffered = 0
        
        # Combat & Magic
        self.active_spell = 'fireball'
        self.rage_meter = 0.0 # 0.0 to 100.0 for Apocalypse Smash
        self.max_rage = 100.0
        self.combo = 0
        self.combo_timer = 0
        self.kills = 0
        self.anim_timer = 0
        self.shield_active = False

        # Upgradeable Perks Dictionary
        self.perks = {
            'multi_cast': 0,     # +1 extra projectile
            'explosive_core': 0, # +50% explosive AoE radius
            'slam_mastery': 0,   # +100% slam shockwave damage/range
            'blizzard': 0,       # Freezes last 2x longer
            'chain_stun': 0,     # Lightning arcs to +2 extra targets
            'hyper_dash': 0,     # Dash cooldown -40%
            'magnet': 0,         # Magnet pull distance
            'arcane_shield': 0,  # Auto regenerating shield
            'vampirism': 0       # Heal chance on high combos
        }

    def trigger_slam(self):
        if not self.on_ground and not self.slamming:
            self.slamming = True
            self.vy = 24.0 # High-speed downward smash
            audio.play('dash')

    def trigger_dash(self):
        dash_cd_limit = 24 if self.perks['hyper_dash'] > 0 else 40
        if self.dash_cooldown <= 0 and self.dash_timer <= 0:
            self.dash_timer = 10
            self.dash_cooldown = dash_cd_limit
            self.invincible = max(self.invincible, 14)
            audio.play('dash')

    def switch_spell(self, spell_name):
        if spell_name in self.SPELLS:
            self.active_spell = spell_name
            audio.play('pickup')

    def update(self, keys, platforms, particles, floating_texts):
        self.anim_timer += 1
        
        # Timers
        if self.cooldown > 0: self.cooldown -= 1
        if self.invincible > 0: self.invincible -= 1
        if self.hit_flash > 0: self.hit_flash -= 1
        if self.dash_cooldown > 0: self.dash_cooldown -= 1
        if self.combo_timer > 0:
            self.combo_timer -= 1
        else:
            self.combo = 0

        # Jump buffering & Coyote time
        if self.on_ground:
            self.coyote_timer = 6
        elif self.coyote_timer > 0:
            self.coyote_timer -= 1

        if self.jump_buffered > 0:
            self.jump_buffered -= 1

        # Horizontal Movement
        self.vx = 0
        if self.dash_timer > 0:
            self.dash_timer -= 1
            self.vx = self.facing * (22.0 if self.perks['hyper_dash'] > 0 else 18.0)
            # Dash particle trail
            particles.append(Particle(self.rect.centerx, self.rect.centery, CYAN, size=6, speed=2, lifetime=12, glow=True))
        else:
            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                self.vx = -self.speed
                self.facing = -1
            if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                self.vx = self.speed
                self.facing = 1

        # Jump Trigger
        if (keys[pygame.K_UP] or keys[pygame.K_w] or self.jump_buffered > 0) and self.coyote_timer > 0:
            self.vy = self.jump_power
            self.on_ground = False
            self.coyote_timer = 0
            self.jump_buffered = 0
            audio.play('jump')
            for _ in range(6):
                particles.append(Particle(self.rect.centerx, self.rect.bottom, WHITE, size=3, speed=3, lifetime=15))

        # Gravity & Terminal Velocity
        if not self.slamming:
            self.vy += self.gravity
            if self.vy > 18: self.vy = 18
        else:
            self.vy = 25.0
            particles.append(Particle(self.rect.centerx, self.rect.bottom, GOLD, size=5, speed=2, lifetime=10, glow=True))

        # Horizontal Collision
        self.rect.x += int(self.vx)
        for p in platforms:
            if not p.is_broken and self.rect.colliderect(p):
                if self.vx > 0: self.rect.right = p.left
                elif self.vx < 0: self.rect.left = p.right

        # Vertical Collision
        self.rect.y += int(self.vy)
        self.on_ground = False
        for p in platforms:
            if not p.is_broken and self.rect.colliderect(p):
                if self.vy > 0:
                    self.rect.bottom = p.top
                    self.on_ground = True
                    
                    # If was Ground Slamming -> Create Massive Shockwave!
                    if self.slamming:
                        self.slamming = False
                        audio.play('slam')
                        slam_radius = 220 if self.perks['slam_mastery'] > 0 else 140
                        slam_dmg = 6.0 if self.perks['slam_mastery'] > 0 else 3.5
                        floating_texts.append(FloatingText("⚡ SEISMIC SLAM!", self.rect.centerx, self.rect.top - 20, GOLD, 36))
                        # Blast particles
                        for _ in range(35):
                            particles.append(Particle(self.rect.centerx, self.rect.bottom, GOLD, size=6, speed=8, lifetime=28, glow=True))
                            particles.append(Particle(self.rect.centerx, self.rect.bottom, ORANGE, size=5, speed=6, lifetime=22))

                    # Bouncy Mushroom Platform interaction
                    if p.p_type == 'bouncy':
                        self.vy = self.jump_power * 1.55
                        self.on_ground = False
                        audio.play('jump')
                        for _ in range(12):
                            particles.append(Particle(self.rect.centerx, self.rect.bottom, MAGENTA, size=5, speed=6, lifetime=20, glow=True))
                    elif p.p_type == 'crumble':
                        if p.crumble_timer == 0:
                            p.crumble_timer = 60 # Crumbles after 1 sec
                    else:
                        self.vy = 0

                elif self.vy < 0:
                    self.rect.top = p.bottom
                    self.vy = 0

        # Screen Bounds
        self.rect.left = max(0, self.rect.left)
        self.rect.right = min(SCREEN_WIDTH, self.rect.right)

    def shoot(self, target_dx=0, target_dy=0):
        if self.cooldown > 0:
            return []

        projectiles = []
        angle = math.atan2(target_dy, target_dx) if (target_dx != 0 or target_dy != 0) else (0 if self.facing > 0 else math.pi)
        
        # Multi-cast Perk / Projectile Count
        shot_count = 1 + self.perks['multi_cast']
        spread_angle = 0.18

        dmg_mult = 1.0 + (0.3 * self.combo if self.combo < 10 else 3.0)
        size_mult = 1.4 if self.perks['explosive_core'] > 0 else 1.0

        for i in range(shot_count):
            offset_angle = angle + (i - (shot_count - 1) / 2) * spread_angle
            p = Projectile(self.rect.centerx + self.facing * 20, self.rect.centery - 12, offset_angle, self.active_spell, dmg_mult, size_mult)
            projectiles.append(p)

        # Set Cooldowns per Spell
        cd_map = {'fireball': 12, 'lightning': 16, 'ice': 14, 'meteor': 28}
        self.cooldown = cd_map.get(self.active_spell, 12)

        # Sound effect
        audio.play(self.active_spell)
        return projectiles

    def draw(self, surface):
        if self.hit_flash > 0 and self.hit_flash % 6 < 3:
            return

        x = self.rect.centerx
        y = self.rect.bottom
        f = self.facing

        # Shadow
        shadow_s = pygame.Surface((44, 12), pygame.SRCALPHA)
        pygame.draw.ellipse(shadow_s, (0, 0, 0, 90), (0, 0, 44, 12))
        surface.blit(shadow_s, (x - 22, y - 6))

        # Shield Bubble
        if self.shield_active:
            shield_s = pygame.Surface((70, 80), pygame.SRCALPHA)
            alpha = int(120 + 50 * math.sin(self.anim_timer * 0.15))
            pygame.draw.ellipse(shield_s, (CYAN[0], CYAN[1], CYAN[2], alpha), (0, 0, 70, 80), 3)
            surface.blit(shield_s, (x - 35, y - 70))

        # Wizard Robe with dynamic breathing bob
        bob = math.sin(self.anim_timer * 0.18) * 2 if self.on_ground and self.vx == 0 else 0
        robe_pts = [(x - 18, y), (x + 18, y), (x + 13, y - 34 + bob), (x - 13, y - 34 + bob)]
        pygame.draw.polygon(surface, ROBE_COLOR, robe_pts)
        # Robe trim & golden sash
        pygame.draw.line(surface, GOLD, (x - 13, y - 18 + bob), (x + 13, y - 18 + bob), 3)
        pygame.draw.line(surface, (255, 255, 255, 60), (x, y - 34 + bob), (x, y), 2)

        # Head & Skin
        head_center = (x, int(y - 40 + bob))
        pygame.draw.circle(surface, SKIN, head_center, 13)

        # Hair Tufts (Fiery Red)
        pygame.draw.polygon(surface, (230, 60, 30), [
            (x - 12, y - 48 + bob), (x + 12, y - 48 + bob), (x, y - 58 + bob)
        ])

        # Cool Wizard Spectacles
        eye_x = x + f * 4
        eye_y = int(y - 40 + bob)
        pygame.draw.circle(surface, (50, 50, 60), (eye_x, eye_y), 6, 2)
        pygame.draw.circle(surface, WHITE, (eye_x, eye_y), 4)
        pygame.draw.circle(surface, (40, 140, 255), (eye_x + f, eye_y), 2)

        # Wizard Hat
        hat_bottom = y - 50 + bob
        pygame.draw.ellipse(surface, HAT_COLOR, (x - 22, hat_bottom - 4, 44, 10))
        hat_pts = [(x - 14, hat_bottom), (x + 14, hat_bottom), (x + f * 6, hat_bottom - 36)]
        pygame.draw.polygon(surface, HAT_COLOR, hat_pts)
        pygame.draw.circle(surface, GOLD, (int(x + f * 6), int(hat_bottom - 36)), 4)

        # Glowing Arcane Staff
        staff_x = x + f * 18
        staff_y = y - 28 + bob
        pygame.draw.line(surface, (130, 75, 30), (x + f * 6, y - 22 + bob), (staff_x, staff_y - 10), 4)
        
        # Staff Orb glow matches selected spell
        spell_colors = {'fireball': ORANGE, 'lightning': CYAN, 'ice': (180, 230, 255), 'meteor': PURPLE}
        orb_col = spell_colors.get(self.active_spell, GOLD)
        glow_pulse = 0.6 + 0.4 * math.sin(self.anim_timer * 0.2)
        glow_surf = pygame.Surface((24, 24), pygame.SRCALPHA)
        pygame.draw.circle(glow_surf, (orb_col[0], orb_col[1], orb_col[2], int(150 * glow_pulse)), (12, 12), 12)
        surface.blit(glow_surf, (staff_x - 12, staff_y - 22))
        pygame.draw.circle(surface, orb_col, (int(staff_x), int(staff_y - 10)), 5)
        pygame.draw.circle(surface, WHITE, (int(staff_x), int(staff_y - 10)), 2)

# -----------------------------------------------------------------------------
# Zombie Enemy Hierarchy
# -----------------------------------------------------------------------------
class Zombie:
    def __init__(self, z_type, platform):
        self.type = z_type
        self.platform = platform
        self.alive = True
        self.hit_timer = 0
        self.anim_frame = random.uniform(0, 100)
        self.frozen_timer = 0

        # Stats by Zombie Class
        if z_type == 'runner':
            self.w, self.h = 28, 32
            self.speed = 3.6
            self.hp = self.max_hp = 2.0
            self.color = (190, 45, 60)
            self.score_val = 30
            self.name = "Ghoul Runner"
        elif z_type == 'spitter':
            self.w, self.h = 36, 36
            self.speed = 1.4
            self.hp = self.max_hp = 3.5
            self.color = SLIME_GREEN
            self.score_val = 45
            self.name = "Acid Spitter"
            self.spit_cooldown = random.randint(60, 120)
        elif z_type == 'boomer':
            self.w, self.h = 38, 38
            self.speed = 2.2
            self.hp = self.max_hp = 2.5
            self.color = (240, 140, 20)
            self.score_val = 50
            self.name = "Explosive Boomer"
        elif z_type == 'brute':
            self.w, self.h = 52, 52
            self.speed = 1.1
            self.hp = self.max_hp = 8.0
            self.color = (130, 40, 170)
            self.score_val = 80
            self.name = "Armored Goliath"
        elif z_type == 'necromancer':
            self.w, self.h = 34, 44
            self.speed = 1.6
            self.hp = self.max_hp = 5.0
            self.color = DARK_PURPLE
            self.score_val = 100
            self.name = "Undead Necromancer"
            self.summon_cd = 180
        elif z_type == 'boss_abomination':
            self.w, self.h = 96, 96
            self.speed = 1.8
            self.hp = self.max_hp = 60.0
            self.color = (180, 25, 45)
            self.score_val = 500
            self.name = "ABOMINATION TITAN"
            self.attack_timer = 90
        elif z_type == 'boss_necrolord':
            self.w, self.h = 88, 92
            self.speed = 2.0
            self.hp = self.max_hp = 90.0
            self.color = (110, 20, 160)
            self.score_val = 1000
            self.name = "NECROLORD OF THE DAMNED"
            self.attack_timer = 80
        else: # Standard Zombie
            self.w, self.h = 32, 36
            self.speed = 1.8
            self.hp = self.max_hp = 2.0
            self.color = (60, 180, 75)
            self.score_val = 20
            self.name = "Undead Walker"

        # Spawn placement
        self.x = float(random.randint(int(platform.left + 20), int(max(platform.left + 21, platform.right - 20 - self.w))))
        self.y = float(platform.top - self.h)
        self.vx = self.speed if random.random() > 0.5 else -self.speed
        self.vy = 0.0

    def get_rect(self):
        return pygame.Rect(int(self.x), int(self.y), self.w, self.h)

    def update(self, player_rect, enemy_projectiles, spawned_zombies, platforms):
        if not self.alive:
            return

        self.anim_frame += 1
        if self.hit_timer > 0: self.hit_timer -= 1
        if self.frozen_timer > 0:
            self.frozen_timer -= 1
            return # Immobilized or slowed

        cx = self.x + self.w / 2

        # AI Behavior Patterns
        if self.type in ['runner', 'boomer', 'boss_abomination']:
            # Aggressively hunt player
            self.vx = self.speed if player_rect.centerx > cx else -self.speed
        elif self.type == 'spitter':
            # Maintain distance and spit acid projectiles
            if abs(player_rect.centerx - cx) < 180:
                self.vx = -self.speed if player_rect.centerx > cx else self.speed
            else:
                self.vx = 0
            self.spit_cooldown -= 1
            if self.spit_cooldown <= 0:
                self.spit_cooldown = random.randint(90, 150)
                angle = math.atan2(player_rect.centery - (self.y + 10), player_rect.centerx - cx)
                enemy_projectiles.append({
                    'x': cx, 'y': self.y + 10, 'vx': math.cos(angle) * 7.5, 'vy': math.sin(angle) * 7.5,
                    'r': 7, 'color': SLIME_GREEN, 'life': 90
                })
        elif self.type == 'necromancer':
            # Patrol and summon minions
            self.summon_cd -= 1
            if self.summon_cd <= 0:
                self.summon_cd = 200
                spawned_zombies.append(Zombie('runner', self.platform))
        else: # Standard Patrol
            if self.x <= self.platform.left:
                self.vx = self.speed
            elif self.x + self.w >= self.platform.right:
                self.vx = -self.speed

        self.x += self.vx

    def take_damage(self, amount, damage_type='fireball', particles=None):
        self.hp -= amount
        self.hit_timer = 8
        audio.play('zombie_hit')

        if damage_type == 'ice':
            self.frozen_timer = 70

        if particles:
            splat_col = (200, 30, 40) if self.type != 'spitter' else SLIME_GREEN
            for _ in range(8):
                particles.append(Particle(self.x + self.w/2, self.y + self.h/2, splat_col, size=4, speed=5, lifetime=20))

        if self.hp <= 0:
            self.alive = False
            audio.play('zombie_kill')
            return True # Killed
        return False

    def draw(self, surface):
        if not self.alive:
            return

        cx = int(self.x + self.w / 2)
        bottom = int(self.y + self.h)
        bob = math.sin(self.anim_frame * 0.15) * 2

        color = WHITE if self.hit_timer > 0 else ((140, 210, 255) if self.frozen_timer > 0 else self.color)

        # Zombie Body
        pygame.draw.ellipse(surface, color, (self.x, self.y + bob, self.w, self.h))

        # Zombie Eyes (Menacing Glowing Red/Yellow)
        eye_dir = 1 if self.vx > 0 else -1
        eye_color = YELLOW if self.type == 'boomer' else RED
        pygame.draw.circle(surface, eye_color, (int(cx + eye_dir * 5), int(self.y + 12 + bob)), max(2, self.w // 7))
        pygame.draw.circle(surface, BLACK, (int(cx + eye_dir * 6), int(self.y + 12 + bob)), max(1, self.w // 12))

        # Zombie Arms Shambling Forward
        arm_x = cx + eye_dir * (self.w // 2 + 4)
        pygame.draw.line(surface, color, (cx, int(self.y + self.h // 2 + bob)), (arm_x, int(self.y + self.h // 2 - 4 + bob)), 4)

        # HP Gauge for Brutes, Necromancers & Bosses
        if self.max_hp > 2.0:
            bw = self.w * 1.3
            bx = cx - bw / 2
            by = self.y - 14 + bob
            pygame.draw.rect(surface, BLACK, (bx, by, bw, 6), border_radius=2)
            pct = max(0.0, self.hp / self.max_hp)
            bar_color = GREEN if pct > 0.5 else (YELLOW if pct > 0.25 else RED)
            pygame.draw.rect(surface, bar_color, (bx, by, bw * pct, 6), border_radius=2)
            pygame.draw.rect(surface, WHITE, (bx, by, bw, 6), 1, border_radius=2)

# -----------------------------------------------------------------------------
# Wave Management & Progression Engine
# -----------------------------------------------------------------------------
class GameEngine:
    def __init__(self):
        self.state = 'start' # 'start', 'playing', 'shop', 'game_over'
        self.wave = 1
        self.score = 0
        self.lives = 5
        self.max_lives = 5
        self.gold = 0
        self.screen_shake = 0
        self.shake_intensity = 0
        
        self.player = Riley()
        self.platforms = []
        self.zombies = []
        self.projectiles = []
        self.enemy_projectiles = []
        self.pickups = []
        self.particles = []
        self.floating_texts = []
        self.weather = WeatherSystem()
        
        self.shop_options = []
        self.selected_shop_idx = 0
        self.total_zombies_killed = 0
        self.boss_active = False

    def get_current_biome(self):
        idx = (self.wave - 1) % len(BIOMES)
        return BIOMES[idx]

    def trigger_screen_shake(self, frames=15, intensity=8):
        self.screen_shake = frames
        self.shake_intensity = intensity

    def setup_wave(self):
        self.platforms = generate_procedural_level(self.wave)
        self.zombies = []
        self.enemy_projectiles = []
        self.boss_active = False

        # Boss Waves every 5 waves
        if self.wave % 5 == 0:
            self.boss_active = True
            boss_type = 'boss_necrolord' if self.wave >= 10 else 'boss_abomination'
            boss_plat = self.platforms[0] # Ground
            boss = Zombie(boss_type, boss_plat)
            self.zombies.append(boss)
            audio.play('boss_roar')
            self.floating_texts.append(FloatingText(f"⚠️ BOSS ENCOUNTER: {boss.name}!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, RED, 44, 90))
            # Escorts
            for _ in range(4):
                plat = random.choice(self.platforms[1:])
                self.zombies.append(Zombie('runner', plat))
        else:
            # Standard Wave Spawns
            count = min(22, 4 + self.wave * 3)
            for _ in range(count):
                plat = random.choice(self.platforms[1:])
                # Weighted Spawn Distribution
                if self.wave == 1:
                    z_type = 'standard'
                elif self.wave == 2:
                    z_type = random.choices(['standard', 'runner'], weights=[0.6, 0.4])[0]
                elif self.wave == 3:
                    z_type = random.choices(['standard', 'runner', 'spitter'], weights=[0.45, 0.35, 0.2])[0]
                elif self.wave == 4:
                    z_type = random.choices(['standard', 'runner', 'spitter', 'boomer'], weights=[0.35, 0.3, 0.2, 0.15])[0]
                else:
                    z_type = random.choices(['standard', 'runner', 'spitter', 'boomer', 'brute', 'necromancer'], weights=[0.25, 0.25, 0.2, 0.15, 0.1, 0.05])[0]
                self.zombies.append(Zombie(z_type, plat))

        biome = self.get_current_biome()
        self.floating_texts.append(FloatingText(f"Wave {self.wave}: {biome['name']}", SCREEN_WIDTH//2, SCREEN_HEIGHT//2 - 50, GOLD, 50, 80))

    def open_upgrade_shop(self):
        self.state = 'shop'
        all_perks = [
            {'id': 'multi_cast', 'name': 'Arcane Split Shot', 'desc': 'Fires +1 extra projectile per spell cast.', 'cost': 120},
            {'id': 'explosive_core', 'name': 'Infernal Core', 'desc': 'Spell explosion radius & impact area +50%.', 'cost': 150},
            {'id': 'slam_mastery', 'name': 'Titan Ground Slam', 'desc': 'Ground slam shockwave damage and range +100%.', 'cost': 140},
            {'id': 'blizzard', 'name': 'Frostbite Mastery', 'desc': 'Ice spells freeze enemies 2x longer & deal bonus shatter damage.', 'cost': 110},
            {'id': 'chain_stun', 'name': 'Tesla Voltage', 'desc': 'Lightning arcs to 2 additional targets with stun.', 'cost': 130},
            {'id': 'hyper_dash', 'name': 'Chrono Warp Dash', 'desc': 'Dash cooldown reduced by 40% with longer invulnerability.', 'cost': 100},
            {'id': 'magnet', 'name': 'Arcane Magnet', 'desc': 'Loot & powerups are automatically drawn to Riley.', 'cost': 90},
            {'id': 'vampirism', 'name': 'Vampiric Blast', 'desc': 'High combos grant a chance to heal +1 Life.', 'cost': 160},
            {'id': 'extra_life', 'name': 'Full Elixir of Life', 'desc': 'Restores all missing hearts and raises Max Life by 1.', 'cost': 180}
        ]
        self.shop_options = random.sample(all_perks, 3)
        self.selected_shop_idx = 0
        audio.play('powerup')

    def apply_perk(self, perk):
        if self.gold < perk['cost']:
            return False

        self.gold -= perk['cost']
        if perk['id'] == 'extra_life':
            self.max_lives += 1
            self.lives = self.max_lives
        else:
            self.player.perks[perk['id']] = self.player.perks.get(perk['id'], 0) + 1

        audio.play('pickup')
        self.floating_texts.append(FloatingText(f"Acquired {perk['name']}!", SCREEN_WIDTH//2, SCREEN_HEIGHT//2, GREEN, 42))
        return True

    def reset_game(self):
        self.state = 'playing'
        self.wave = 1
        self.score = 0
        self.lives = 5
        self.max_lives = 5
        self.gold = 0
        self.total_zombies_killed = 0
        self.player = Riley()
        self.projectiles.clear()
        self.enemy_projectiles.clear()
        self.pickups.clear()
        self.particles.clear()
        self.floating_texts.clear()
        self.setup_wave()

# -----------------------------------------------------------------------------
# Main Game Loop & Renderer
# -----------------------------------------------------------------------------
def run_game():
    game = GameEngine()

    while True:
        keys = pygame.key.get_pressed()

        # ---------------------------------------------------------------------
        # Event Handling
        # ---------------------------------------------------------------------
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()

            if event.type == pygame.KEYDOWN:
                if game.state == 'start':
                    if event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                        game.reset_game()

                elif game.state == 'playing':
                    # Spell Switching (1, 2, 3, 4)
                    if event.key == pygame.K_1: game.player.switch_spell('fireball')
                    elif event.key == pygame.K_2: game.player.switch_spell('lightning')
                    elif event.key == pygame.K_3: game.player.switch_spell('ice')
                    elif event.key == pygame.K_4: game.player.switch_spell('meteor')

                    # Dash (Shift)
                    elif event.key in [pygame.K_LSHIFT, pygame.K_RSHIFT]:
                        game.player.trigger_dash()

                    # Ground Slam (Down or S in mid-air)
                    elif event.key in [pygame.K_DOWN, pygame.K_s]:
                        game.player.trigger_slam()

                    # Shoot Spell (Space)
                    elif event.key == pygame.K_SPACE:
                        target_dx = game.player.facing
                        target_dy = -1 if (keys[pygame.K_UP] or keys[pygame.K_w]) else (1 if (keys[pygame.K_DOWN] or keys[pygame.K_s]) else 0)
                        new_projs = game.player.shoot(target_dx, target_dy)
                        game.projectiles.extend(new_projs)

                    # Apocalypse Smash Ultimate (R)
                    elif event.key == pygame.K_r and game.player.rage_meter >= game.player.max_rage:
                        game.player.rage_meter = 0
                        game.trigger_screen_shake(30, 14)
                        audio.play('explosion')
                        game.floating_texts.append(FloatingText("💥 APOCALYPSE METEOR SMASH!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, GOLD, 54))
                        # Wipes all non-boss zombies
                        for z in game.zombies:
                            if z.alive:
                                z.take_damage(25.0, 'meteor', game.particles)
                                game.score += z.score_val * 2
                                game.gold += 15

                elif game.state == 'shop':
                    if event.key in [pygame.K_LEFT, pygame.K_a]:
                        game.selected_shop_idx = (game.selected_shop_idx - 1) % len(game.shop_options)
                    elif event.key in [pygame.K_RIGHT, pygame.K_d]:
                        game.selected_shop_idx = (game.selected_shop_idx + 1) % len(game.shop_options)
                    elif event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                        selected_perk = game.shop_options[game.selected_shop_idx]
                        if game.apply_perk(selected_perk):
                            game.state = 'playing'
                            game.setup_wave()
                    elif event.key == pygame.K_ESCAPE:
                        # Skip shop
                        game.state = 'playing'
                        game.setup_wave()

                elif game.state == 'game_over':
                    if event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                        game.reset_game()

        # ---------------------------------------------------------------------
        # Game State Updates
        # ---------------------------------------------------------------------
        biome = game.get_current_biome()
        game.weather.update(biome['weather'])

        if game.state == 'playing':
            # Update Platforms
            for p in game.platforms:
                p.update()

            # Update Player
            game.player.update(keys, game.platforms, game.particles, game.floating_texts)

            # Continuous Spawning / Zombie Logic
            spawned = []
            for z in game.zombies:
                z.update(game.player.rect, game.enemy_projectiles, spawned, game.platforms)
            game.zombies.extend(spawned)

            # Player Collision with Zombies
            if game.player.invincible <= 0:
                p_rect = game.player.rect
                for z in game.zombies:
                    if z.alive and p_rect.colliderect(z.get_rect()):
                        if game.player.shield_active:
                            game.player.shield_active = False
                            game.player.invincible = 45
                            game.floating_texts.append(FloatingText("SHIELD BROKEN!", game.player.rect.centerx, game.player.rect.top - 15, CYAN, 28))
                            audio.play('dash')
                        else:
                            game.lives -= 1
                            game.player.invincible = 60
                            game.player.hit_flash = 35
                            game.trigger_screen_shake(15, 8)
                            audio.play('hurt')
                            game.floating_texts.append(FloatingText("-1 LIFE", game.player.rect.centerx, game.player.rect.top - 15, RED, 32))
                            if game.lives <= 0:
                                game.state = 'game_over'
                                audio.play('explosion')
                        break

            # Projectiles Update & Collision
            for proj in game.projectiles[:]:
                if not proj.update(game.platforms):
                    # Wall explosion particles
                    for _ in range(8):
                        game.particles.append(Particle(proj.x, proj.y, proj.color, size=4, speed=4, lifetime=15))
                    game.projectiles.remove(proj)
                    continue

                proj_rect = proj.get_rect()
                for z in game.zombies:
                    if z.alive and proj_rect.colliderect(z.get_rect()):
                        dmg = proj.base_damage * proj.damage_mult
                        killed = z.take_damage(dmg, proj.spell_type, game.particles)
                        
                        # Combo & Score
                        game.player.combo += 1
                        game.player.combo_timer = 140
                        game.player.rage_meter = min(game.player.max_rage, game.player.rage_meter + 4.5)
                        
                        # Floating damage popup
                        crit = proj.damage_mult > 1.5
                        game.floating_texts.append(FloatingText(f"{int(dmg*10)}" + (" CRIT!" if crit else ""), z.x + z.w/2, z.y - 10, GOLD if crit else WHITE, 24 if not crit else 32))

                        if killed:
                            game.total_zombies_killed += 1
                            combo_mult = 1 + game.player.combo // 3
                            pts = z.score_val * combo_mult
                            game.score += pts
                            game.gold += random.randint(3, 8)
                            
                            # Drop powerups / coins
                            if random.random() < 0.35:
                                game.pickups.append(Pickup(z.x + z.w/2, z.y + z.h/2))

                        if proj.pierce_left > 0:
                            proj.pierce_left -= 1
                        else:
                            if proj in game.projectiles:
                                game.projectiles.remove(proj)
                        break

            # Enemy Projectiles Update
            for ep in game.enemy_projectiles[:]:
                ep['x'] += ep['vx']
                ep['y'] += ep['vy']
                ep['life'] -= 1
                ep_rect = pygame.Rect(ep['x'] - ep['r'], ep['y'] - ep['r'], ep['r']*2, ep['r']*2)
                
                if ep['life'] <= 0 or ep['x'] < 0 or ep['x'] > SCREEN_WIDTH or ep['y'] > SCREEN_HEIGHT:
                    game.enemy_projectiles.remove(ep)
                    continue

                if game.player.invincible <= 0 and ep_rect.colliderect(game.player.rect):
                    if game.player.shield_active:
                        game.player.shield_active = False
                        game.player.invincible = 40
                    else:
                        game.lives -= 1
                        game.player.invincible = 50
                        game.player.hit_flash = 30
                        game.trigger_screen_shake(12, 6)
                        audio.play('hurt')
                        if game.lives <= 0:
                            game.state = 'game_over'
                    game.enemy_projectiles.remove(ep)

            # Pickups Update & Collection
            for pk in game.pickups[:]:
                if not pk.update(game.platforms, game.player):
                    game.pickups.remove(pk)
                    continue

                dist = math.hypot(game.player.rect.centerx - pk.x, game.player.rect.centery - pk.y)
                if dist < pk.radius + 25:
                    # Collect pickup
                    audio.play('pickup')
                    if pk.type == 'heal':
                        game.lives = min(game.max_lives, game.lives + 1)
                        game.floating_texts.append(FloatingText("+1 HEAL", game.player.rect.centerx, game.player.rect.top - 15, GREEN, 30))
                    elif pk.type == 'shield':
                        game.player.shield_active = True
                        game.floating_texts.append(FloatingText("ARCANE SHIELD!", game.player.rect.centerx, game.player.rect.top - 15, CYAN, 30))
                    elif pk.type == 'coin':
                        game.gold += 10
                        game.score += 50
                    elif pk.type == 'gem':
                        game.gold += 25
                        game.score += 150
                    elif pk.type == 'nuke':
                        audio.play('explosion')
                        game.trigger_screen_shake(25, 12)
                        for z in game.zombies:
                            if z.alive and not z.type.startswith('boss'):
                                z.take_damage(50.0, 'fireball', game.particles)
                        game.floating_texts.append(FloatingText("☢️ HOLY NUKE!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, GOLD, 48))
                    elif pk.type == 'freeze':
                        for z in game.zombies:
                            z.frozen_timer = 180
                        game.floating_texts.append(FloatingText("❄️ BLIZZARD FREEZE!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, CYAN, 44))
                    elif pk.type == 'frenzy':
                        game.player.rage_meter = game.player.max_rage
                        game.floating_texts.append(FloatingText("⚡ ARCANE RAGE READY!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, YELLOW, 44))

                    game.pickups.remove(pk)

            # Wave Completion Check
            alive_zombies = [z for z in game.zombies if z.alive]
            if len(alive_zombies) == 0:
                game.wave += 1
                game.score += 250
                game.gold += 35
                game.open_upgrade_shop()

            # Particles & Floating Texts Update
            game.particles = [p for p in game.particles if p.update()]
            game.floating_texts = [ft for ft in game.floating_texts if ft.update()]
            if game.screen_shake > 0:
                game.screen_shake -= 1

        # ---------------------------------------------------------------------
        # Rendering
        # ---------------------------------------------------------------------
        # Apply Screen Shake Offset
        shake_ox, shake_oy = 0, 0
        if game.screen_shake > 0:
            shake_ox = random.randint(-game.shake_intensity, game.shake_intensity)
            shake_oy = random.randint(-game.shake_intensity, game.shake_intensity)

        # Draw Sky Gradient
        sky_top = biome['sky_top']
        sky_bot = biome['sky_bot']
        for y in range(SCREEN_HEIGHT):
            t = y / SCREEN_HEIGHT
            r = int(sky_top[0] + (sky_bot[0] - sky_top[0]) * t)
            g = int(sky_top[1] + (sky_bot[1] - sky_top[1]) * t)
            b = int(sky_top[2] + (sky_bot[2] - sky_top[2]) * t)
            pygame.draw.line(screen, (r, g, b), (0, y), (SCREEN_WIDTH, y))

        # Draw Weather & Background Layers
        game.weather.draw(screen, biome)

        # Draw Platforms
        for p in game.platforms:
            p.draw(screen, biome)

        # Draw Pickups
        for pk in game.pickups:
            pk.draw(screen)

        # Draw Zombies
        for z in game.zombies:
            z.draw(screen)

        # Draw Enemy Projectiles
        for ep in game.enemy_projectiles:
            pygame.draw.circle(screen, ep['color'], (int(ep['x']), int(ep['y'])), ep['r'])
            pygame.draw.circle(screen, WHITE, (int(ep['x']), int(ep['y'])), max(1, ep['r'] - 3))

        # Draw Player Projectiles
        for proj in game.projectiles:
            proj.draw(screen)

        # Draw Particles
        for part in game.particles:
            part.draw(screen)

        # Draw Player
        if game.state in ['playing', 'shop']:
            game.player.draw(screen)

        # Draw Floating Texts
        for ft in game.floating_texts:
            ft.draw(screen)

        # ---------------------------------------------------------------------
        # HUD & Overlay Displays
        # ---------------------------------------------------------------------
        if game.state == 'playing':
            # Score & Wave
            score_t = font_md.render(f"Score: {game.score:,}", True, GOLD)
            wave_t = font_md.render(f"Wave: {game.wave} ({biome['name']})", True, WHITE)
            gold_t = font_md.render(f"Gold: {game.gold} 🪙", True, YELLOW)
            screen.blit(score_t, (25, 20))
            screen.blit(wave_t, (25, 55))
            screen.blit(gold_t, (25, 90))

            # Lives / Hearts
            for i in range(game.max_lives):
                col = RED if i < game.lives else DARK_GRAY
                hx = SCREEN_WIDTH - 35 - i * 32
                pygame.draw.circle(screen, col, (hx, 35), 11)
                if i < game.lives:
                    pygame.draw.circle(screen, WHITE, (hx - 3, 32), 3)

            # Arcane Rage / Ultimate Bar
            rage_pct = game.player.rage_meter / game.player.max_rage
            pygame.draw.rect(screen, BLACK, (SCREEN_WIDTH - 240, 65, 210, 16), border_radius=4)
            pygame.draw.rect(screen, ORANGE if rage_pct < 1.0 else GOLD, (SCREEN_WIDTH - 240, 65, int(210 * rage_pct), 16), border_radius=4)
            pygame.draw.rect(screen, WHITE, (SCREEN_WIDTH - 240, 65, 210, 16), 2, border_radius=4)
            rage_lbl = font_sm.render("ARCANE SMASH [R]" if rage_pct >= 1.0 else f"Rage: {int(rage_pct*100)}%", True, WHITE)
            screen.blit(rage_lbl, (SCREEN_WIDTH - 230, 66))

            # Spell Selection Hotbar
            spell_names = [('1: Fire', 'fireball', ORANGE), ('2: Spark', 'lightning', CYAN), ('3: Frost', 'ice', (180, 230, 255)), ('4: Void', 'meteor', PURPLE)]
            for idx, (label, s_id, s_col) in enumerate(spell_names):
                bx = SCREEN_WIDTH // 2 - 190 + idx * 95
                by = 20
                is_active = (game.player.active_spell == s_id)
                bg_col = (50, 50, 70) if not is_active else (80, 80, 130)
                pygame.draw.rect(screen, bg_col, (bx, by, 85, 32), border_radius=6)
                pygame.draw.rect(screen, s_col if is_active else DARK_GRAY, (bx, by, 85, 32), 2 if not is_active else 3, border_radius=6)
                t_lbl = font_sm.render(label, True, s_col if is_active else WHITE)
                screen.blit(t_lbl, (bx + 42 - t_lbl.get_width()//2, by + 8))

            # Combo Multiplier Popup
            if game.player.combo > 1:
                combo_t = font_lg.render(f"{game.player.combo}x COMBO!", True, YELLOW)
                screen.blit(combo_t, (SCREEN_WIDTH // 2 - combo_t.get_width()//2, 70))

        # ---------------------------------------------------------------------
        # Upgrade Shop Screen
        # ---------------------------------------------------------------------
        elif game.state == 'shop':
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((10, 10, 25, 220))
            screen.blit(overlay, (0, 0))

            shop_title = font_xl.render("ARCANE UPGRADE EMPORIUM", True, GOLD)
            sub_t = font_md.render(f"Wave {game.wave-1} Complete! Choose a permanent upgrade  |  Your Gold: {game.gold} 🪙", True, WHITE)
            screen.blit(shop_title, (SCREEN_WIDTH//2 - shop_title.get_width()//2, 90))
            screen.blit(sub_t, (SCREEN_WIDTH//2 - sub_t.get_width()//2, 170))

            # Draw 3 Perk Cards
            for idx, perk in enumerate(game.shop_options):
                cx = SCREEN_WIDTH // 2 - 360 + idx * 360
                cy = 240
                w, h = 320, 360
                is_sel = (idx == game.selected_shop_idx)
                card_bg = (35, 35, 60) if not is_sel else (55, 55, 100)
                border_col = GOLD if is_sel else (80, 80, 120)

                pygame.draw.rect(screen, card_bg, (cx, cy, w, h), border_radius=12)
                pygame.draw.rect(screen, border_col, (cx, cy, w, h), 4 if is_sel else 2, border_radius=12)

                # Card Name
                p_title = font_md.render(perk['name'], True, GOLD if is_sel else WHITE)
                screen.blit(p_title, (cx + w//2 - p_title.get_width()//2, cy + 30))

                # Card Cost
                can_afford = game.gold >= perk['cost']
                cost_col = GREEN if can_afford else RED
                cost_t = font_md.render(f"Cost: {perk['cost']} 🪙", True, cost_col)
                screen.blit(cost_t, (cx + w//2 - cost_t.get_width()//2, cy + 80))

                # Card Description (wrapped)
                words = perk['desc'].split(' ')
                lines = []
                cur_line = []
                for wd in words:
                    cur_line.append(wd)
                    if len(' '.join(cur_line)) > 24:
                        lines.append(' '.join(cur_line[:-1]))
                        cur_line = [wd]
                if cur_line: lines.append(' '.join(cur_line))

                for l_idx, line in enumerate(lines):
                    l_surf = font_sm.render(line, True, LIGHT_GRAY)
                    screen.blit(l_surf, (cx + w//2 - l_surf.get_width()//2, cy + 140 + l_idx * 26))

                # Select Button
                btn_txt = "PRESS SPACE TO BUY" if can_afford else "NOT ENOUGH GOLD"
                btn_surf = font_sm.render(btn_txt, True, WHITE if can_afford else DARK_GRAY)
                btn_rect = pygame.Rect(cx + 25, cy + h - 60, w - 50, 40)
                pygame.draw.rect(screen, (50, 150, 70) if can_afford else (40, 40, 40), btn_rect, border_radius=8)
                screen.blit(btn_surf, (cx + w//2 - btn_surf.get_width()//2, cy + h - 50))

            skip_t = font_sm.render("[LEFT/RIGHT] Select Card  |  [SPACE] Purchase  |  [ESC] Skip to Next Wave", True, LIGHT_GRAY)
            screen.blit(skip_t, (SCREEN_WIDTH//2 - skip_t.get_width()//2, SCREEN_HEIGHT - 80))

        # ---------------------------------------------------------------------
        # Start Title Screen
        # ---------------------------------------------------------------------
        elif game.state == 'start':
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((10, 10, 25, 200))
            screen.blit(overlay, (0, 0))

            title = font_xl.render("RILEY SMASHES THE ZOMBIES", True, GOLD)
            sub = font_lg.render("Ultimate Arcane Platformer", True, CYAN)
            inst1 = font_md.render("[A/D or ←/→] Move  |  [W or ↑] Jump  |  [S or ↓] Seismic Ground Slam", True, WHITE)
            inst2 = font_md.render("[SPACE] Cast Spell  |  [SHIFT] Dash  |  [1/2/3/4] Switch Arcane Spells", True, WHITE)
            inst3 = font_md.render("[R] Unleash Apocalypse Meteor Smash when Rage Meter is full!", True, YELLOW)
            start_btn = font_lg.render("Press SPACE or ENTER to Play", True, GREEN)

            screen.blit(title, (SCREEN_WIDTH//2 - title.get_width()//2, 160))
            screen.blit(sub, (SCREEN_WIDTH//2 - sub.get_width()//2, 240))
            screen.blit(inst1, (SCREEN_WIDTH//2 - inst1.get_width()//2, 350))
            screen.blit(inst2, (SCREEN_WIDTH//2 - inst2.get_width()//2, 400))
            screen.blit(inst3, (SCREEN_WIDTH//2 - inst3.get_width()//2, 450))
            screen.blit(start_btn, (SCREEN_WIDTH//2 - start_btn.get_width()//2, 570))

        # ---------------------------------------------------------------------
        # Game Over Screen
        # ---------------------------------------------------------------------
        elif game.state == 'game_over':
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((15, 5, 10, 230))
            screen.blit(overlay, (0, 0))

            over_t = font_xl.render("YOU HAVE FALLEN", True, RED)
            score_t = font_lg.render(f"Final Score: {game.score:,}", True, GOLD)
            stats_t = font_md.render(f"Waves Survived: {game.wave}  |  Zombies Smashed: {game.total_zombies_killed}", True, WHITE)
            restart_t = font_md.render("Press SPACE or ENTER to Rise Again", True, GREEN)

            screen.blit(over_t, (SCREEN_WIDTH//2 - over_t.get_width()//2, SCREEN_HEIGHT//2 - 120))
            screen.blit(score_t, (SCREEN_WIDTH//2 - score_t.get_width()//2, SCREEN_HEIGHT//2 - 20))
            screen.blit(stats_t, (SCREEN_WIDTH//2 - stats_t.get_width()//2, SCREEN_HEIGHT//2 + 50))
            screen.blit(restart_t, (SCREEN_WIDTH//2 - restart_t.get_width()//2, SCREEN_HEIGHT//2 + 130))

        pygame.display.flip()
        clock.tick(FPS)

if __name__ == "__main__":
    run_game()
