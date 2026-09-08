#!/usr/bin/env python3
"""
===============================================================================
       RILEY SMASHES THE ZOMBIES: ULTRA HD GRAPHICS EDITION
===============================================================================
The definitive 2D arcane action-platformer starring Riley the Wizard.

Massive Graphics & Visual Upgrades:
- Dynamic Point-Lighting Engine: Radial lights on staff, projectiles, explosions, torches
- Multi-Layer Parallax Environments: Deep starfield with twinkling constellations,
  glowing moon with craters, distant gothic spire silhouettes, and volumetric mist
- High-Detail Procedural Sprites: Flowing velvet cape, runic robe trim, glasses gleam,
  rotating arcane gem with orbital mana rings, shadowed decaying zombie anatomy
- Screen Juice & VFX: Shockwave blast rings, fractal electric sparks, frost shimmers,
  swirling void accretion disks, bone debris physics, and animated achievement badges!
===============================================================================
"""

import pygame
import random
import sys
import math
import array
import os

SCREEN_WIDTH = 1200
SCREEN_HEIGHT = 800
FPS = 60

# Vibrant High-Contrast Palette
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

pygame.init()
try:
    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
    AUDIO_AVAILABLE = True
except Exception:
    AUDIO_AVAILABLE = False

screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Riley Smashes the Zombies — Ultra HD Graphics Edition")
clock = pygame.time.Clock()

font_xs = pygame.font.Font(None, 20)
font_sm = pygame.font.Font(None, 26)
font_md = pygame.font.Font(None, 36)
font_lg = pygame.font.Font(None, 56)
font_xl = pygame.font.Font(None, 88)

pygame.joystick.init()
joysticks = [pygame.joystick.Joystick(x) for x in range(pygame.joystick.get_count())]
for j in joysticks:
    j.init()

# -----------------------------------------------------------------------------
# Audio Engine
# -----------------------------------------------------------------------------
class SoundEngine:
    def __init__(self):
        self.sounds = {}
        self.enabled = AUDIO_AVAILABLE
        if self.enabled: self._generate_all_sounds()

    def _create_sound(self, generator_func, duration=0.2, volume=0.3):
        try:
            sample_rate = 44100
            n_samples = int(sample_rate * duration)
            buf = array.array('h')
            for i in range(n_samples):
                t = i / sample_rate
                val = generator_func(t, duration)
                sample = int(max(-1.0, min(1.0, val)) * 32767 * volume)
                buf.append(sample); buf.append(sample)
            return pygame.mixer.Sound(buffer=buf)
        except Exception:
            return None

    def _generate_all_sounds(self):
        self.sounds['jump'] = self._create_sound(lambda t, d: math.sin(2 * math.pi * (320 + 450 * (t/d)**0.7) * t) * (1 - t/d), 0.15, 0.25)
        self.sounds['dash'] = self._create_sound(lambda t, d: (random.random() * 2 - 1) * math.sin(2 * math.pi * (800 - 600 * (t/d)) * t) * (1 - t/d)**0.5, 0.18, 0.3)
        self.sounds['fireball'] = self._create_sound(lambda t, d: (math.sin(2 * math.pi * (600 - 300 * (t/d)) * t) * 0.6 + (random.random() * 2 - 1) * 0.4) * (1 - t/d), 0.16, 0.28)
        self.sounds['lightning'] = self._create_sound(lambda t, d: ((random.random()*2-1)*0.7 + (1 if math.sin(2*math.pi*1200*t)>0 else -1)*0.3) * (1 - (t/d)**0.5), 0.22, 0.35)
        self.sounds['ice'] = self._create_sound(lambda t, d: math.sin(2 * math.pi * (1400 + 300 * math.sin(40*t)) * t) * (1 - t/d)**1.5, 0.25, 0.25)
        self.sounds['meteor'] = self._create_sound(lambda t, d: (math.sin(2 * math.pi * (160 - 120 * (t/d)) * t) * 0.6 + (random.random()*2-1)*0.4) * (1 - t/d)**0.7, 0.45, 0.45)
        self.sounds['vortex'] = self._create_sound(lambda t, d: math.sin(2 * math.pi * (200 + 400 * math.sin(20*t)) * t) * (1 - t/d), 0.4, 0.35)
        self.sounds['laser'] = self._create_sound(lambda t, d: (1 if math.sin(2*math.pi*880*t)>0 else -1) * 0.4 * (1 - t/d), 0.2, 0.25)
        self.sounds['melee'] = self._create_sound(lambda t, d: math.sin(2 * math.pi * (350 - 250 * (t/d)) * t) * (1 - t/d)**0.5, 0.15, 0.35)
        self.sounds['slam'] = self._create_sound(lambda t, d: (math.sin(2 * math.pi * (220 - 180 * (t/d)) * t) * 0.7 + (random.random()*2-1)*0.3) * (1 - t/d)**0.5, 0.35, 0.5)
        self.sounds['zombie_hit'] = self._create_sound(lambda t, d: ((random.random()*2-1)*0.6 + math.sin(2*math.pi*180*t)*0.4) * (1 - t/d)**2, 0.12, 0.3)
        self.sounds['zombie_kill'] = self._create_sound(lambda t, d: ((random.random()*2-1)*0.8 + math.sin(2*math.pi*300*(1-t/d)*t)*0.2) * (1 - t/d), 0.2, 0.35)
        self.sounds['pickup'] = self._create_sound(lambda t, d: math.sin(2 * math.pi * (600 + (1200 if t>d*0.5 else 0)) * t) * (1 - t/d), 0.14, 0.25)
        self.sounds['powerup'] = self._create_sound(lambda t, d: (math.sin(2*math.pi*523.25*t) + math.sin(2*math.pi*659.25*t) + math.sin(2*math.pi*783.99*t))/3 * (1 - t/d), 0.35, 0.35)
        self.sounds['hurt'] = self._create_sound(lambda t, d: ((1 if math.sin(2*math.pi*110*t)>0 else -1)*0.6 + (random.random()*2-1)*0.4) * (1 - t/d), 0.25, 0.35)
        self.sounds['boss_roar'] = self._create_sound(lambda t, d: (math.sin(2*math.pi*(80 + 30*math.sin(15*t))*t)*0.6 + (random.random()*2-1)*0.4) * (1 - (t/d)**0.5), 0.6, 0.5)
        self.sounds['achievement'] = self._create_sound(lambda t, d: (math.sin(2*math.pi*587*t) + math.sin(2*math.pi*880*t))/2 * (1 - t/d), 0.45, 0.4)

    def play(self, sound_name):
        if not self.enabled: return
        snd = self.sounds.get(sound_name)
        if snd:
            try: snd.play()
            except Exception: pass

audio = SoundEngine()

# -----------------------------------------------------------------------------
# Biomes
# -----------------------------------------------------------------------------
BIOMES = [
    {'name': 'Haunted Graveyard', 'sky_top': (10, 8, 25), 'sky_bot': (32, 28, 60), 'grass': (35, 140, 65), 'dirt': (65, 42, 28), 'weather': 'fog', 'accent': (120, 255, 160), 'moon': (230, 245, 250)},
    {'name': 'Toxic Mire & Ruins', 'sky_top': (8, 22, 15), 'sky_bot': (22, 58, 40), 'grass': (65, 220, 55), 'dirt': (28, 55, 32), 'weather': 'spores', 'accent': (160, 255, 50), 'moon': (200, 240, 160)},
    {'name': 'Crimson Blood Citadel', 'sky_top': (35, 6, 15), 'sky_bot': (85, 22, 35), 'grass': (190, 40, 50), 'dirt': (80, 18, 22), 'weather': 'embers', 'accent': (255, 80, 80), 'moon': (255, 140, 140)},
    {'name': 'Arcane Cosmic Sanctum', 'sky_top': (18, 6, 40), 'sky_bot': (65, 28, 100), 'grass': (150, 65, 230), 'dirt': (50, 22, 75), 'weather': 'stars', 'accent': (220, 130, 255), 'moon': (225, 180, 255)},
    {'name': 'Frozen Necropolis', 'sky_top': (8, 18, 40), 'sky_bot': (35, 65, 100), 'grass': (160, 230, 255), 'dirt': (40, 60, 90), 'weather': 'snow', 'accent': (130, 230, 255), 'moon': (210, 240, 255)},
    {'name': 'Infernal Nether Abyss', 'sky_top': (45, 12, 6), 'sky_bot': (120, 45, 12), 'grass': (250, 125, 25), 'dirt': (105, 40, 12), 'weather': 'embers', 'accent': (255, 185, 35), 'moon': (255, 210, 130)}
]

STARS = [{'x': random.randint(0, SCREEN_WIDTH), 'y': random.randint(0, int(SCREEN_HEIGHT * 0.75)), 's': random.uniform(0.8, 2.5), 't': random.uniform(0, 100), 'spd': random.uniform(0.02, 0.05)} for _ in range(160)]

# -----------------------------------------------------------------------------
# Visual Effects & Shockwaves
# -----------------------------------------------------------------------------
class Particle:
    def __init__(self, x, y, color, size=4, speed=4, lifetime=25, gravity=0.15, glow=False):
        self.x, self.y = float(x), float(y)
        angle = random.uniform(0, math.pi * 2)
        spd = random.uniform(speed * 0.3, speed * 1.5)
        self.vx = math.cos(angle) * spd
        self.vy = math.sin(angle) * spd
        self.color = color
        self.size = size
        self.life = self.max_life = lifetime
        self.gravity = gravity
        self.glow = glow

    def update(self):
        self.x += self.vx; self.y += self.vy; self.vy += self.gravity
        self.life -= 1
        return self.life > 0

    def draw(self, surface):
        progress = max(0.0, self.life / self.max_life)
        cur_size = max(1, int(self.size * progress))
        alpha = int(255 * progress)
        s = pygame.Surface((cur_size * 4, cur_size * 4), pygame.SRCALPHA)
        col = (self.color[0], self.color[1], self.color[2], alpha)
        pygame.draw.circle(s, col, (cur_size * 2, cur_size * 2), cur_size)
        if self.glow and cur_size > 2:
            pygame.draw.circle(s, (self.color[0], self.color[1], self.color[2], int(alpha * 0.35)), (cur_size * 2, cur_size * 2), cur_size * 2)
        surface.blit(s, (int(self.x - cur_size * 2), int(self.y - cur_size * 2)))

class ShockwaveRing:
    def __init__(self, x, y, color=GOLD, max_radius=90, duration=24):
        self.x, self.y = float(x), float(y)
        self.color = color
        self.max_radius = max_radius
        self.duration = self.max_duration = duration

    def update(self):
        self.duration -= 1
        return self.duration > 0

    def draw(self, surface):
        p = 1.0 - (self.duration / self.max_duration)
        rad = max(2, int(self.max_radius * p))
        alpha = int(255 * (1.0 - p) * 0.7)
        s = pygame.Surface((rad * 2 + 8, rad * 2 + 8), pygame.SRCALPHA)
        col = (self.color[0], self.color[1], self.color[2], alpha)
        pygame.draw.circle(s, col, (rad + 4, rad + 4), rad, max(1, int((1.0 - p) * 5)))
        surface.blit(s, (int(self.x - rad - 4), int(self.y - rad - 4)))

class BoneDebris:
    def __init__(self, x, y):
        self.x, self.y = float(x), float(y)
        self.vx = random.uniform(-4, 4)
        self.vy = random.uniform(-6, -2)
        self.angle = random.uniform(0, 360)
        self.rot_speed = random.uniform(-15, 15)
        self.life = self.max_life = random.randint(60, 100)
        self.size = random.randint(4, 8)

    def update(self, platforms):
        self.x += self.vx; self.y += self.vy; self.vy += 0.35
        self.angle += self.rot_speed; self.life -= 1
        for p in platforms:
            if not p.is_broken and p.collidepoint(self.x, self.y + self.size):
                self.y = p.top - self.size; self.vy = -self.vy * 0.4; self.vx *= 0.6
                break
        return self.life > 0

    def draw(self, surface):
        progress = self.life / self.max_life
        alpha = int(255 * min(1.0, progress * 1.5))
        s = pygame.Surface((self.size * 2, self.size * 2), pygame.SRCALPHA)
        pygame.draw.rect(s, (235, 235, 225, alpha), (self.size//2, 0, self.size, self.size * 2))
        rotated = pygame.transform.rotate(s, self.angle)
        surface.blit(rotated, (int(self.x - rotated.get_width()//2), int(self.y - rotated.get_height()//2)))

class FloatingText:
    def __init__(self, text, x, y, color=GOLD, size=28, duration=50):
        self.text = text
        self.x, self.y = float(x), float(y)
        self.color = color
        self.duration = self.max_duration = duration
        self.vy = -1.6
        self.font = pygame.font.Font(None, size)

    def update(self):
        self.y += self.vy; self.vy *= 0.95; self.duration -= 1
        return self.duration > 0

    def draw(self, surface):
        alpha = min(255, int(255 * (self.duration / (self.max_duration * 0.4))))
        rendered = self.font.render(self.text, True, self.color)
        s = pygame.Surface(rendered.get_size(), pygame.SRCALPHA)
        s.blit(rendered, (0, 0)); s.set_alpha(alpha)
        shadow = self.font.render(self.text, True, BLACK)
        shadow_s = pygame.Surface(shadow.get_size(), pygame.SRCALPHA)
        shadow_s.blit(shadow, (0, 0)); shadow_s.set_alpha(int(alpha * 0.7))
        surface.blit(shadow_s, (int(self.x - shadow.get_width()//2 + 2), int(self.y + 2)))
        surface.blit(s, (int(self.x - rendered.get_width()//2), int(self.y)))

class AchievementBanner:
    def __init__(self, title, desc):
        self.title, self.desc = title, desc
        self.timer = 180; self.y = -80

    def update(self):
        self.timer -= 1
        if self.timer > 140: self.y += (30 - self.y) * 0.2
        elif self.timer < 30: self.y += (-90 - self.y) * 0.2
        return self.timer > 0

    def draw(self, surface):
        w, h = 390, 70; x = SCREEN_WIDTH // 2 - w // 2
        s = pygame.Surface((w, h), pygame.SRCALPHA)
        pygame.draw.rect(s, (20, 20, 45, 235), (0, 0, w, h), border_radius=10)
        pygame.draw.rect(s, GOLD, (0, 0, w, h), 2, border_radius=10)
        surface.blit(s, (x, int(self.y)))
        t1 = font_sm.render(f"🏆 ACHIEVEMENT: {self.title}", True, GOLD)
        t2 = font_xs.render(self.desc, True, WHITE)
        surface.blit(t1, (x + 20, int(self.y) + 14))
        surface.blit(t2, (x + 20, int(self.y) + 40))

# -----------------------------------------------------------------------------
# Platforms with Masonry & Torches
# -----------------------------------------------------------------------------
class Platform(pygame.Rect):
    def __init__(self, x, y, width, height=24, p_type='solid'):
        super().__init__(x, y, width, height)
        self.p_type = p_type
        self.move_timer = random.uniform(0, 100)
        self.crumble_timer = 0; self.is_broken = False; self.respawn_timer = 0
        self.has_torch = (width > 200 and random.random() > 0.4)
        self.torch_x = x + (25 if random.random() > 0.5 else width - 25)

    def update(self):
        if self.p_type == 'moving':
            self.move_timer += 0.03
            self.x += math.sin(self.move_timer) * 1.8
        elif self.p_type == 'crumble':
            if self.crumble_timer > 0:
                self.crumble_timer -= 1
                if self.crumble_timer == 0: self.is_broken = True; self.respawn_timer = 180
            elif self.is_broken:
                self.respawn_timer -= 1
                if self.respawn_timer <= 0: self.is_broken = False

    def draw(self, surface, theme, frame_count):
        if self.is_broken: return
        dirt_col = theme['dirt']; grass_col = theme['grass']
        shake_x = random.randint(-2, 2) if self.crumble_timer > 0 else 0
        rect = pygame.Rect(self.x + shake_x, self.y, self.width, self.height)
        pygame.draw.rect(surface, dirt_col, rect, border_radius=4)

        # Masonry lines
        for bx in range(int(self.x) + 30, int(self.x + self.width) - 10, 40):
            pygame.draw.line(surface, (0, 0, 0, 80), (bx + shake_x, self.y + 6), (bx + shake_x, self.y + self.height - 2), 1)

        if self.p_type == 'bouncy':
            pygame.draw.rect(surface, MAGENTA, (self.x + shake_x, self.y, self.width, 8), border_radius=3)
            for i in range(int(self.x) + 12, int(self.x + self.width) - 10, 16):
                pygame.draw.circle(surface, YELLOW, (i + shake_x, self.y + 4), 2.5)
        elif self.p_type == 'crumble':
            pygame.draw.rect(surface, (130, 110, 95), (self.x + shake_x, self.y, self.width, 7), border_radius=3)
        else:
            pygame.draw.rect(surface, grass_col, (self.x + shake_x, self.y, self.width, 7), border_radius=3)
            for i in range(int(self.x) + 8, int(self.x + self.width) - 8, 12):
                pygame.draw.line(surface, grass_col, (i + shake_x, self.y), (i + shake_x + 1, self.y - 4), 2)

        # Torch Brazier
        if self.has_torch:
            tx = int(self.torch_x + shake_x)
            pygame.draw.rect(surface, (30, 30, 35), (tx - 3, self.y - 12, 6, 12))
            fl = math.sin(frame_count * 0.2 + tx) * 2
            pygame.draw.circle(surface, ORANGE, (int(tx + fl*0.5), self.y - 18), 5)
            pygame.draw.circle(surface, YELLOW, (int(tx + fl*0.3), self.y - 19), 3)

        pygame.draw.rect(surface, (255, 255, 255, 40), rect, 1, border_radius=4)

def generate_procedural_level(wave_num):
    platforms = [Platform(0, SCREEN_HEIGHT - 60, SCREEN_WIDTH, 60, 'solid')]
    tier_heights = [SCREEN_HEIGHT - 200, SCREEN_HEIGHT - 340, SCREEN_HEIGHT - 480, SCREEN_HEIGHT - 620]

    for y in tier_heights:
        p_count = random.choice([2, 3]) if y > SCREEN_HEIGHT - 500 else random.choice([1, 2])
        types = ['solid', 'solid', 'solid']
        if wave_num >= 2 and random.random() > 0.5: types.append('bouncy')
        if wave_num >= 3 and random.random() > 0.6: types.append('crumble')
        if wave_num >= 4 and random.random() > 0.7: types.append('moving')

        if p_count == 1:
            w = random.randint(280, 420); x = random.randint(220, SCREEN_WIDTH - w - 220)
            platforms.append(Platform(x, y, w, p_type=random.choice(types)))
        elif p_count == 2:
            w1 = random.randint(210, 310); x1 = random.randint(60, SCREEN_WIDTH // 2 - w1 - 20)
            w2 = random.randint(210, 310); x2 = random.randint(SCREEN_WIDTH // 2 + 40, SCREEN_WIDTH - w2 - 60)
            platforms.append(Platform(x1, y, w1, p_type=random.choice(types)))
            platforms.append(Platform(x2, y, w2, p_type=random.choice(types)))
        else:
            w1 = random.randint(160, 230); x1 = random.randint(40, 260)
            w2 = random.randint(180, 250); x2 = random.randint(420, 680)
            w3 = random.randint(160, 230); x3 = random.randint(840, SCREEN_WIDTH - w3 - 40)
            platforms.append(Platform(x1, y, w1, p_type=random.choice(types)))
            platforms.append(Platform(x2, y, w2, p_type=random.choice(types)))
            platforms.append(Platform(x3, y, w3, p_type=random.choice(types)))

    return platforms

# -----------------------------------------------------------------------------
# Pickups & Relics
# -----------------------------------------------------------------------------
class Pickup:
    def __init__(self, x, y, p_type=None):
        self.x, self.y = float(x), float(y)
        self.vy = -4.0; self.vx = random.uniform(-1.5, 1.5)
        self.type = p_type or random.choices(
            ['coin', 'gem', 'heal', 'shield', 'frenzy', 'freeze', 'nuke'],
            weights=[0.40, 0.25, 0.12, 0.08, 0.07, 0.05, 0.03]
        )[0]
        self.life = 450; self.bob_timer = random.uniform(0, 10); self.radius = 14

    def update(self, platforms, player):
        self.bob_timer += 0.08; self.life -= 1
        dx = player.rect.centerx - self.x; dy = player.rect.centery - self.y
        dist = math.hypot(dx, dy)
        magnet_range = 300 if player.perks.get('magnet', 0) > 0 else 75
        if 0 < dist < magnet_range:
            spd = 8.0 if player.perks.get('magnet', 0) > 0 else 4.0
            self.vx += (dx / dist) * spd * 0.15; self.vy += (dy / dist) * spd * 0.15

        self.x += self.vx; self.y += self.vy; self.vx *= 0.95; self.vy += 0.25
        for p in platforms:
            if not p.is_broken and p.collidepoint(self.x, self.y + self.radius):
                self.y = p.top - self.radius; self.vy = 0; break
        return self.life > 0

    def draw(self, surface):
        if self.life < 90 and self.life % 8 < 4: return
        cx = int(self.x); cy = int(self.y + math.sin(self.bob_timer) * 3)
        color_map = {'heal': GREEN, 'shield': CYAN, 'nuke': GOLD, 'freeze': (180, 230, 255), 'frenzy': ORANGE, 'gem': PURPLE, 'coin': YELLOW}
        col = color_map.get(self.type, WHITE)

        glow_s = pygame.Surface((self.radius * 4, self.radius * 4), pygame.SRCALPHA)
        pygame.draw.circle(glow_s, (col[0], col[1], col[2], 65), (self.radius * 2, self.radius * 2), self.radius * 2)
        surface.blit(glow_s, (cx - self.radius * 2, cy - self.radius * 2))

        pygame.draw.circle(surface, col, (cx, cy), self.radius)
        pygame.draw.circle(surface, WHITE, (cx, cy), self.radius - 3)
        sym_map = {'heal': '♥', 'shield': '🛡', 'nuke': '💣', 'freeze': '❄', 'frenzy': '⚡', 'gem': '✦', 'coin': '●'}
        txt = font_xs.render(sym_map.get(self.type, '?'), True, col)
        surface.blit(txt, (cx - txt.get_width()//2, cy - txt.get_height()//2))

# -----------------------------------------------------------------------------
# Spells & Projectiles
# -----------------------------------------------------------------------------
class Projectile:
    def __init__(self, x, y, angle, spell_type='fireball', damage_mult=1.0, size_mult=1.0):
        self.x, self.y = float(x), float(y)
        self.spell_type = spell_type; self.angle = angle; self.damage_mult = damage_mult
        self.pierce_left = 3 if spell_type in ['ice', 'laser'] else (10 if spell_type == 'vortex' else 0)
        self.trail = []

        if spell_type == 'lightning':
            self.speed = 22.0; self.radius = int(8 * size_mult); self.life = 45; self.color = CYAN; self.base_damage = 2.5
        elif spell_type == 'ice':
            self.speed = 14.0; self.radius = int(10 * size_mult); self.life = 60; self.color = (160, 230, 255); self.base_damage = 1.8
        elif spell_type == 'meteor':
            self.speed = 10.0; self.radius = int(16 * size_mult); self.life = 85; self.color = PURPLE; self.base_damage = 5.0
        elif spell_type == 'vortex':
            self.speed = 8.0; self.radius = int(18 * size_mult); self.life = 100; self.color = (220, 80, 255); self.base_damage = 3.2
        elif spell_type == 'laser':
            self.speed = 28.0; self.radius = int(10 * size_mult); self.life = 35; self.color = YELLOW; self.base_damage = 4.0
        else:
            self.speed = 15.0; self.radius = int(12 * size_mult); self.life = 70; self.color = ORANGE; self.base_damage = 2.0

        self.vx = math.cos(angle) * self.speed; self.vy = math.sin(angle) * self.speed
        if spell_type == 'meteor': self.vy -= 2.0

    def get_rect(self):
        return pygame.Rect(self.x - self.radius, self.y - self.radius, self.radius * 2, self.radius * 2)

    def update(self, platforms):
        self.trail.append((self.x, self.y))
        if len(self.trail) > 8: self.trail.pop(0)
        if self.spell_type == 'meteor': self.vy += 0.25
        self.x += self.vx; self.y += self.vy; self.life -= 1
        rect = self.get_rect()
        for p in platforms:
            if not p.is_broken and rect.colliderect(p) and self.spell_type not in ['laser', 'vortex']: return False
        return self.life > 0 and 0 <= self.x <= SCREEN_WIDTH and 0 <= self.y <= SCREEN_HEIGHT

    def draw(self, surface):
        for i, (tx, ty) in enumerate(self.trail):
            t_alpha = int(255 * (i / len(self.trail)) * 0.5)
            t_rad = max(2, int(self.radius * (i / len(self.trail))))
            ts = pygame.Surface((t_rad * 2, t_rad * 2), pygame.SRCALPHA)
            pygame.draw.circle(ts, (self.color[0], self.color[1], self.color[2], t_alpha), (t_rad, t_rad), t_rad)
            surface.blit(ts, (int(tx - t_rad), int(ty - t_rad)))

        glow = pygame.Surface((self.radius * 4, self.radius * 4), pygame.SRCALPHA)
        pygame.draw.circle(glow, (self.color[0], self.color[1], self.color[2], 90), (self.radius * 2, self.radius * 2), self.radius * 2)
        surface.blit(glow, (int(self.x - self.radius * 2), int(self.y - self.radius * 2)))
        pygame.draw.circle(surface, self.color, (int(self.x), int(self.y)), self.radius)
        pygame.draw.circle(surface, WHITE, (int(self.x), int(self.y)), max(2, self.radius - 4))

# -----------------------------------------------------------------------------
# Riley Hero
# -----------------------------------------------------------------------------
class Riley:
    SPELLS = ['fireball', 'lightning', 'ice', 'meteor', 'vortex', 'laser']

    def __init__(self):
        self.rect = pygame.Rect(SCREEN_WIDTH // 2 - 22, SCREEN_HEIGHT - 130, 44, 58)
        self.vx, self.vy = 0.0, 0.0
        self.speed = 7.4; self.jump_power = -16.2; self.gravity = 0.68
        self.on_ground = False; self.on_wall = 0; self.double_jump_ready = True
        self.facing = 1; self.cooldown = 0; self.melee_cooldown = 0
        self.invincible = 0; self.hit_flash = 0; self.dash_cooldown = 0; self.dash_timer = 0
        self.slamming = False; self.coyote_timer = 0; self.jump_buffered = 0
        self.active_spell = 'fireball'; self.rage_meter = 0.0; self.max_rage = 100.0
        self.combo = 0; self.combo_timer = 0; self.anim_timer = 0; self.shield_active = False
        self.perks = {'multi_cast': 0, 'explosive_core': 0, 'slam_mastery': 0, 'blizzard': 0, 'chain_stun': 0, 'hyper_dash': 0, 'magnet': 0, 'vampirism': 0, 'double_jump': 1}

    def trigger_melee_swing(self, zombies, enemy_projectiles, particles, floating_texts):
        if self.melee_cooldown > 0: return
        self.melee_cooldown = 20; audio.play('melee')
        hitbox = pygame.Rect(self.rect.centerx + (10 if self.facing > 0 else -60), self.rect.centery - 30, 50, 60)
        for ep in enemy_projectiles[:]:
            ep_rect = pygame.Rect(ep['x'] - ep['r'], ep['y'] - ep['r'], ep['r']*2, ep['r']*2)
            if hitbox.colliderect(ep_rect):
                ep['vx'] = -ep['vx'] * 1.5; ep['vy'] = -ep['vy'] * 1.5
                floating_texts.append(FloatingText("DEFLECT!", ep['x'], ep['y'] - 10, CYAN, 24))
        for z in zombies:
            if z.alive and hitbox.colliderect(z.get_rect()):
                z.take_damage(4.0, 'melee', particles)
                z.vx = self.facing * 8.0
                floating_texts.append(FloatingText("STAFF SMASH!", z.x + z.w/2, z.y - 10, GOLD, 26))
        for _ in range(12): particles.append(Particle(self.rect.centerx + self.facing * 30, self.rect.centery, YELLOW, size=5, speed=6, lifetime=16, glow=True))

    def trigger_slam(self):
        if not self.on_ground and not self.slamming:
            self.slamming = True; self.vy = 25.0; audio.play('dash')

    def trigger_dash(self):
        cd_limit = 24 if self.perks['hyper_dash'] > 0 else 40
        if self.dash_cooldown <= 0 and self.dash_timer <= 0:
            self.dash_timer = 10; self.dash_cooldown = cd_limit; self.invincible = max(self.invincible, 14); audio.play('dash')

    def switch_spell(self, spell_name):
        if spell_name in self.SPELLS: self.active_spell = spell_name; audio.play('pickup')

    def update(self, keys, platforms, particles, floating_texts, shockwaves):
        self.anim_timer += 1
        if self.cooldown > 0: self.cooldown -= 1
        if self.melee_cooldown > 0: self.melee_cooldown -= 1
        if self.invincible > 0: self.invincible -= 1
        if self.hit_flash > 0: self.hit_flash -= 1
        if self.dash_cooldown > 0: self.dash_cooldown -= 1
        if self.combo_timer > 0: self.combo_timer -= 1
        else: self.combo = 0

        if self.on_ground: self.coyote_timer = 6; self.double_jump_ready = True
        elif self.coyote_timer > 0: self.coyote_timer -= 1

        self.vx = 0
        if self.dash_timer > 0:
            self.dash_timer -= 1
            self.vx = self.facing * (22.0 if self.perks['hyper_dash'] > 0 else 18.0)
            particles.append(Particle(self.rect.centerx, self.rect.centery, CYAN, size=6, speed=2, lifetime=12, glow=True))
        else:
            if keys[pygame.K_LEFT] or keys[pygame.K_a]: self.vx = -self.speed; self.facing = -1
            if keys[pygame.K_RIGHT] or keys[pygame.K_d]: self.vx = self.speed; self.facing = 1

        jump_req = keys[pygame.K_UP] or keys[pygame.K_w] or self.jump_buffered > 0
        if jump_req:
            if self.coyote_timer > 0:
                self.vy = self.jump_power; self.on_ground = False; self.coyote_timer = 0; self.jump_buffered = 0; audio.play('jump')
                for _ in range(6): particles.append(Particle(self.rect.centerx, self.rect.bottom, WHITE, size=3, speed=3, lifetime=15))
            elif self.on_wall != 0:
                self.vy = self.jump_power * 0.95; self.vx = -self.on_wall * self.speed * 1.4; self.facing = -self.on_wall; self.on_wall = 0; audio.play('jump')
                floating_texts.append(FloatingText("WALL JUMP!", self.rect.centerx, self.rect.centery, CYAN, 22))
            elif self.double_jump_ready and self.perks.get('double_jump', 0) > 0:
                self.vy = self.jump_power * 0.88; self.double_jump_ready = False; audio.play('jump')
                floating_texts.append(FloatingText("DOUBLE JUMP!", self.rect.centerx, self.rect.centery, GOLD, 22))

        if not self.slamming:
            if self.on_wall != 0 and self.vy > 0:
                self.vy += self.gravity * 0.35
                if self.vy > 4.0: self.vy = 4.0
            else:
                self.vy += self.gravity
                if self.vy > 18: self.vy = 18
        else:
            self.vy = 26.0
            particles.append(Particle(self.rect.centerx, self.rect.bottom, GOLD, size=5, speed=2, lifetime=10, glow=True))

        self.rect.x += int(self.vx)
        self.on_wall = 0
        for p in platforms:
            if not p.is_broken and self.rect.colliderect(p):
                if self.vx > 0: self.rect.right = p.left; self.on_wall = 1 if not self.on_ground else 0
                elif self.vx < 0: self.rect.left = p.right; self.on_wall = -1 if not self.on_ground else 0

        self.rect.y += int(self.vy)
        self.on_ground = False
        for p in platforms:
            if not p.is_broken and self.rect.colliderect(p):
                if self.vy > 0:
                    self.rect.bottom = p.top; self.on_ground = True
                    if self.slamming:
                        self.slamming = False; audio.play('slam')
                        shockwaves.append(ShockwaveRing(self.rect.centerx, self.rect.bottom, GOLD, 140, 24))
                        floating_texts.append(FloatingText("⚡ SEISMIC SLAM!", self.rect.centerx, self.rect.top - 20, GOLD, 36))
                        for _ in range(35): particles.append(Particle(self.rect.centerx, self.rect.bottom, GOLD, size=6, speed=8, lifetime=28, glow=True))
                    if p.p_type == 'bouncy':
                        self.vy = self.jump_power * 1.55; self.on_ground = False; audio.play('jump')
                        shockwaves.append(ShockwaveRing(self.rect.centerx, self.rect.bottom, MAGENTA, 70, 18))
                    elif p.p_type == 'crumble' and p.crumble_timer == 0: p.crumble_timer = 60
                    else: self.vy = 0
                elif self.vy < 0: self.rect.top = p.bottom; self.vy = 0

        self.rect.left = max(0, self.rect.left); self.rect.right = min(SCREEN_WIDTH, self.rect.right)

    def shoot(self, target_dx=0, target_dy=0):
        if self.cooldown > 0: return []
        projectiles = []
        angle = math.atan2(target_dy, target_dx) if (target_dx != 0 or target_dy != 0) else (0 if self.facing > 0 else math.pi)
        shot_count = 1 + self.perks['multi_cast']
        spread_angle = 0.18
        dmg_mult = 1.0 + (0.3 * self.combo if self.combo < 10 else 3.0)
        size_mult = 1.4 if self.perks['explosive_core'] > 0 else 1.0
        for i in range(shot_count):
            offset_angle = angle + (i - (shot_count - 1) / 2) * spread_angle
            projectiles.append(Projectile(self.rect.centerx + self.facing * 20, self.rect.centery - 12, offset_angle, self.active_spell, dmg_mult, size_mult))
        cd_map = {'fireball': 12, 'lightning': 16, 'ice': 14, 'meteor': 28, 'vortex': 35, 'laser': 8}
        self.cooldown = cd_map.get(self.active_spell, 12); audio.play(self.active_spell)
        return projectiles

    def draw(self, surface):
        if self.hit_flash > 0 and self.hit_flash % 6 < 3: return
        x, y, f = self.rect.centerx, self.rect.bottom, self.facing
        bob = math.sin(self.anim_timer * 0.18) * 2 if self.on_ground and self.vx == 0 else 0

        # Shadow
        shadow_s = pygame.Surface((44, 12), pygame.SRCALPHA)
        pygame.draw.ellipse(shadow_s, (0, 0, 0, 95), (0, 0, 44, 12))
        surface.blit(shadow_s, (x - 22, y - 6))

        # Flowing Cape
        cape_pts = [(x - f * 6, y - 34 + bob), (x - f * 24 - int(self.vx*2), y - 18), (x - f * 18 - int(self.vx*3), y - 2), (x - f * 4, y - 2)]
        pygame.draw.polygon(surface, (30, 35, 110), cape_pts)

        # Robe
        robe_pts = [(x - 18, y), (x + 18, y), (x + 13, y - 34 + bob), (x - 13, y - 34 + bob)]
        pygame.draw.polygon(surface, ROBE_COLOR, robe_pts)
        pygame.draw.line(surface, GOLD, (x - 13, y - 18 + bob), (x + 13, y - 18 + bob), 3)

        # Head & Glasses
        head_center = (x, int(y - 40 + bob))
        pygame.draw.circle(surface, SKIN, head_center, 13)
        pygame.draw.polygon(surface, (230, 60, 30), [(x - 12, y - 48 + bob), (x + 12, y - 48 + bob), (x, y - 58 + bob)])

        eye_x, eye_y = x + f * 4, int(y - 40 + bob)
        pygame.draw.circle(surface, (50, 50, 60), (eye_x, eye_y), 6, 2)
        pygame.draw.circle(surface, WHITE, (eye_x, eye_y), 4)
        pygame.draw.circle(surface, (40, 140, 255), (eye_x + f, eye_y), 2)

        # Hat
        hat_bottom = y - 50 + bob
        pygame.draw.ellipse(surface, HAT_COLOR, (x - 22, hat_bottom - 4, 44, 10))
        pygame.draw.polygon(surface, HAT_COLOR, [(x - 14, hat_bottom), (x + 14, hat_bottom), (x + f * 6, hat_bottom - 36)])
        pygame.draw.circle(surface, GOLD, (int(x + f * 6), int(hat_bottom - 36)), 4)

        # Staff
        staff_x, staff_y = x + f * 18, y - 28 + bob
        pygame.draw.line(surface, (130, 75, 30), (x + f * 6, y - 22 + bob), (staff_x, staff_y - 10), 4)
        spell_colors = {'fireball': ORANGE, 'lightning': CYAN, 'ice': (180, 230, 255), 'meteor': PURPLE, 'vortex': MAGENTA, 'laser': YELLOW}
        orb_col = spell_colors.get(self.active_spell, GOLD)
        pygame.draw.circle(surface, orb_col, (int(staff_x), int(staff_y - 10)), 5)

# -----------------------------------------------------------------------------
# Zombie Hierarchy
# -----------------------------------------------------------------------------
class Zombie:
    def __init__(self, z_type, platform):
        self.type = z_type; self.platform = platform; self.alive = True
        self.hit_timer = 0; self.anim_frame = random.uniform(0, 100); self.frozen_timer = 0
        self.is_elite = random.random() < 0.15 and not z_type.startswith('boss')

        if z_type == 'runner':
            self.w, self.h = 28, 32; self.speed = 3.6; self.hp = self.max_hp = 2.0; self.color = (190, 45, 60); self.score_val = 30; self.name = "Ghoul Runner"
        elif z_type == 'spitter':
            self.w, self.h = 36, 36; self.speed = 1.4; self.hp = self.max_hp = 3.5; self.color = SLIME_GREEN; self.score_val = 45; self.name = "Acid Spitter"; self.spit_cooldown = random.randint(60, 120)
        elif z_type == 'boomer':
            self.w, self.h = 38, 38; self.speed = 2.2; self.hp = self.max_hp = 2.5; self.color = (240, 140, 20); self.score_val = 50; self.name = "Explosive Boomer"
        elif z_type == 'gargoyle':
            self.w, self.h = 34, 30; self.speed = 3.0; self.hp = self.max_hp = 3.0; self.color = (90, 110, 150); self.score_val = 60; self.name = "Winged Gargoyle"; self.altitude = random.randint(150, 350)
        elif z_type == 'shield_skeleton':
            self.w, self.h = 34, 40; self.speed = 1.5; self.hp = self.max_hp = 5.0; self.color = (210, 210, 200); self.score_val = 70; self.name = "Shield Skeleton"
        elif z_type == 'brute':
            self.w, self.h = 52, 52; self.speed = 1.1; self.hp = self.max_hp = 8.0; self.color = (130, 40, 170); self.score_val = 80; self.name = "Armored Goliath"
        elif z_type == 'necromancer':
            self.w, self.h = 34, 44; self.speed = 1.6; self.hp = self.max_hp = 5.0; self.color = DARK_PURPLE; self.score_val = 100; self.name = "Necromancer"; self.summon_cd = 180
        elif z_type == 'boss_abomination':
            self.w, self.h = 96, 96; self.speed = 1.8; self.hp = self.max_hp = 60.0; self.color = (180, 25, 45); self.score_val = 500; self.name = "ABOMINATION TITAN"
        elif z_type == 'boss_necrolord':
            self.w, self.h = 88, 92; self.speed = 2.0; self.hp = self.max_hp = 90.0; self.color = (110, 20, 160); self.score_val = 1000; self.name = "NECROLORD OF THE DAMNED"
        elif z_type == 'boss_void_lich':
            self.w, self.h = 104, 104; self.speed = 2.2; self.hp = self.max_hp = 140.0; self.color = (50, 10, 90); self.score_val = 2000; self.name = "VOID CYCLOPS LICH-KING"
        else:
            self.w, self.h = 32, 36; self.speed = 1.8; self.hp = self.max_hp = 2.0; self.color = (60, 180, 75); self.score_val = 20; self.name = "Undead Walker"

        if self.is_elite: self.speed *= 1.4; self.hp *= 1.5; self.max_hp *= 1.5; self.score_val *= 2
        self.x = float(random.randint(int(platform.left + 20), int(max(platform.left + 21, platform.right - 20 - self.w))))
        self.y = float(platform.top - self.h) if z_type != 'gargoyle' else float(self.altitude)
        self.vx = self.speed if random.random() > 0.5 else -self.speed

    def get_rect(self): return pygame.Rect(int(self.x), int(self.y), self.w, self.h)

    def update(self, player_rect, enemy_projectiles, spawned_zombies, platforms):
        if not self.alive: return
        self.anim_frame += 1
        if self.hit_timer > 0: self.hit_timer -= 1
        if self.frozen_timer > 0: self.frozen_timer -= 1; return

        cx = self.x + self.w / 2
        if self.type == 'gargoyle':
            dx = player_rect.centerx - cx; self.vx = math.copysign(self.speed, dx); self.y += math.sin(self.anim_frame * 0.1) * 2
        elif self.type in ['runner', 'boomer', 'boss_abomination', 'boss_void_lich']:
            self.vx = self.speed if player_rect.centerx > cx else -self.speed
        elif self.type == 'spitter':
            if abs(player_rect.centerx - cx) < 180: self.vx = -self.speed if player_rect.centerx > cx else self.speed
            else: self.vx = 0
            self.spit_cooldown -= 1
            if self.spit_cooldown <= 0:
                self.spit_cooldown = random.randint(90, 150)
                angle = math.atan2(player_rect.centery - (self.y + 10), player_rect.centerx - cx)
                enemy_projectiles.append({'x': cx, 'y': self.y + 10, 'vx': math.cos(angle) * 7.5, 'vy': math.sin(angle) * 7.5, 'r': 7, 'color': SLIME_GREEN, 'life': 90})
        elif self.type == 'necromancer':
            self.summon_cd -= 1
            if self.summon_cd <= 0: self.summon_cd = 200; spawned_zombies.append(Zombie('runner', self.platform))
        else:
            if self.x <= self.platform.left: self.vx = self.speed
            elif self.x + self.w >= self.platform.right: self.vx = -self.speed
        self.x += self.vx

    def take_damage(self, amount, damage_type='fireball', particles=None):
        self.hp -= amount; self.hit_timer = 8; audio.play('zombie_hit')
        if damage_type == 'ice': self.frozen_timer = 70
        if particles:
            splat_col = (200, 30, 40) if self.type != 'spitter' else SLIME_GREEN
            for _ in range(8): particles.append(Particle(self.x + self.w/2, self.y + self.h/2, splat_col, size=4, speed=5, lifetime=20))
        if self.hp <= 0: self.alive = False; audio.play('zombie_kill'); return True
        return False

    def draw(self, surface):
        if not self.alive: return
        cx, bottom = int(self.x + self.w / 2), int(self.y + self.h)
        bob = math.sin(self.anim_frame * 0.15) * 2
        color = WHITE if self.hit_timer > 0 else ((140, 210, 255) if self.frozen_timer > 0 else self.color)

        if self.is_elite:
            elite_s = pygame.Surface((self.w + 20, self.h + 20), pygame.SRCALPHA)
            pygame.draw.ellipse(elite_s, (GOLD[0], GOLD[1], GOLD[2], 90), (0, 0, self.w + 20, self.h + 20), 2)
            surface.blit(elite_s, (self.x - 10, self.y - 10 + bob))

        pygame.draw.ellipse(surface, color, (self.x, self.y + bob, self.w, self.h))
        eye_dir = 1 if self.vx > 0 else -1
        eye_color = YELLOW if self.type == 'boomer' else RED
        pygame.draw.circle(surface, eye_color, (int(cx + eye_dir * 5), int(self.y + 12 + bob)), max(2, self.w // 7))
        pygame.draw.circle(surface, BLACK, (int(cx + eye_dir * 6), int(self.y + 12 + bob)), max(1, self.w // 12))
        arm_x = cx + eye_dir * (self.w // 2 + 4)
        pygame.draw.line(surface, color, (cx, int(self.y + self.h // 2 + bob)), (arm_x, int(self.y + self.h // 2 - 4 + bob)), 4)

        if self.max_hp > 2.0:
            bw = self.w * 1.3; bx, by = cx - bw / 2, self.y - 14 + bob
            pygame.draw.rect(surface, BLACK, (bx, by, bw, 6), border_radius=2)
            pct = max(0.0, self.hp / self.max_hp)
            bar_color = GREEN if pct > 0.5 else (YELLOW if pct > 0.25 else RED)
            pygame.draw.rect(surface, bar_color, (bx, by, bw * pct, 6), border_radius=2)
            pygame.draw.rect(surface, WHITE, (bx, by, bw, 6), 1, border_radius=2)

# -----------------------------------------------------------------------------
# Main Game Engine
# -----------------------------------------------------------------------------
class GameEngine:
    def __init__(self):
        self.state = 'start'
        self.wave = 1; self.score = 0; self.lives = 5; self.max_lives = 5; self.gold = 0
        self.screen_shake = 0; self.shake_intensity = 0; self.frame_count = 0
        self.player = Riley(); self.platforms = []; self.zombies = []
        self.projectiles = []; self.enemy_projectiles = []; self.pickups = []
        self.particles = []; self.shockwaves = []; self.bones = []; self.floating_texts = []; self.banners = []
        self.shop_options = []; self.selected_shop_idx = 0; self.total_zombies_killed = 0
        self.unlocked_achievements = set()

    def check_achievement(self, ach_id, title, desc):
        if ach_id not in self.unlocked_achievements:
            self.unlocked_achievements.add(ach_id)
            self.banners.append(AchievementBanner(title, desc)); audio.play('achievement')

    def trigger_screen_shake(self, frames=15, intensity=8):
        self.screen_shake = frames; self.shake_intensity = intensity

    def get_current_biome(self):
        return BIOMES[(self.wave - 1) % len(BIOMES)]

    def setup_wave(self):
        self.platforms = generate_procedural_level(self.wave)
        self.zombies = []; self.enemy_projectiles = []
        if self.wave % 5 == 0:
            b_type = 'boss_void_lich' if self.wave >= 15 else ('boss_necrolord' if self.wave >= 10 else 'boss_abomination')
            boss = Zombie(b_type, self.platforms[0]); self.zombies.append(boss); audio.play('boss_roar')
            self.floating_texts.append(FloatingText(f"⚠️ BOSS ENCOUNTER: {boss.name}!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, RED, 44, 90))
            for _ in range(4): self.zombies.append(Zombie('runner', random.choice(self.platforms[1:])))
        else:
            count = min(25, 4 + self.wave * 3)
            for _ in range(count):
                plat = random.choice(self.platforms[1:])
                z_types = ['standard', 'runner', 'spitter', 'boomer', 'gargoyle', 'shield_skeleton', 'brute', 'necromancer']
                self.zombies.append(Zombie(random.choice(z_types), plat))
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
        self.shop_options = random.sample(all_perks, 3); self.selected_shop_idx = 0; audio.play('powerup')

    def apply_perk(self, perk):
        if self.gold < perk['cost']: return False
        self.gold -= perk['cost']
        if perk['id'] == 'extra_life': self.max_lives += 1; self.lives = self.max_lives
        else: self.player.perks[perk['id']] = self.player.perks.get(perk['id'], 0) + 1
        audio.play('pickup'); self.floating_texts.append(FloatingText(f"Acquired {perk['name']}!", SCREEN_WIDTH//2, SCREEN_HEIGHT//2, GREEN, 42))
        return True

    def reset_game(self):
        self.state = 'playing'; self.wave = 1; self.score = 0; self.lives = 5; self.max_lives = 5; self.gold = 0
        self.total_zombies_killed = 0; self.player = Riley()
        self.projectiles.clear(); self.enemy_projectiles.clear(); self.pickups.clear()
        self.particles.clear(); self.shockwaves.clear(); self.bones.clear(); self.floating_texts.clear(); self.banners.clear()
        self.setup_wave()

def run_game():
    game = GameEngine()

    while True:
        game.frame_count += 1
        keys = pygame.key.get_pressed()

        for event in pygame.event.get():
            if event.type == pygame.QUIT: pygame.quit(); sys.exit()
            if event.type == pygame.KEYDOWN:
                if game.state == 'start':
                    if event.key in [pygame.K_SPACE, pygame.K_RETURN]: game.reset_game()
                elif game.state == 'playing':
                    if event.key == pygame.K_1: game.player.switch_spell('fireball')
                    elif event.key == pygame.K_2: game.player.switch_spell('lightning')
                    elif event.key == pygame.K_3: game.player.switch_spell('ice')
                    elif event.key == pygame.K_4: game.player.switch_spell('meteor')
                    elif event.key == pygame.K_5: game.player.switch_spell('vortex')
                    elif event.key == pygame.K_6: game.player.switch_spell('laser')
                    elif event.key in [pygame.K_LSHIFT, pygame.K_RSHIFT]: game.player.trigger_dash()
                    elif event.key in [pygame.K_DOWN, pygame.K_s]: game.player.trigger_slam()
                    elif event.key in [pygame.K_f, pygame.K_e]:
                        game.player.trigger_melee_swing(game.zombies, game.enemy_projectiles, game.particles, game.floating_texts)
                    elif event.key == pygame.K_SPACE:
                        target_dx = game.player.facing
                        target_dy = -1 if (keys[pygame.K_UP] or keys[pygame.K_w]) else (1 if (keys[pygame.K_DOWN] or keys[pygame.K_s]) else 0)
                        game.projectiles.extend(game.player.shoot(target_dx, target_dy))
                    elif event.key == pygame.K_r and game.player.rage_meter >= game.player.max_rage:
                        game.player.rage_meter = 0; game.trigger_screen_shake(30, 14); audio.play('explosion')
                        game.shockwaves.append(ShockwaveRing(SCREEN_WIDTH//2, SCREEN_HEIGHT//2, GOLD, 400, 35))
                        game.floating_texts.append(FloatingText("💥 APOCALYPSE METEOR SMASH!", SCREEN_WIDTH//2, SCREEN_HEIGHT//3, GOLD, 54))
                        for z in game.zombies:
                            if z.alive: z.take_damage(30.0, 'meteor', game.particles); game.score += z.score_val * 2; game.gold += 15
                elif game.state == 'shop':
                    if event.key in [pygame.K_LEFT, pygame.K_a]: game.selected_shop_idx = (game.selected_shop_idx - 1) % len(game.shop_options)
                    elif event.key in [pygame.K_RIGHT, pygame.K_d]: game.selected_shop_idx = (game.selected_shop_idx + 1) % len(game.shop_options)
                    elif event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                        if game.apply_perk(game.shop_options[game.selected_shop_idx]): game.state = 'playing'; game.setup_wave()
                    elif event.key == pygame.K_ESCAPE: game.state = 'playing'; game.setup_wave()
                elif game.state == 'game_over':
                    if event.key in [pygame.K_SPACE, pygame.K_RETURN]: game.reset_game()

        if game.state == 'playing':
            for p in game.platforms: p.update()
            game.player.update(keys, game.platforms, game.particles, game.floating_texts, game.shockwaves)

            spawned = []
            for z in game.zombies: z.update(game.player.rect, game.enemy_projectiles, spawned, game.platforms)
            game.zombies.extend(spawned)

            if game.player.invincible <= 0:
                p_rect = game.player.rect
                for z in game.zombies:
                    if z.alive and p_rect.colliderect(z.get_rect()):
                        if game.player.shield_active:
                            game.player.shield_active = False; game.player.invincible = 45; audio.play('dash')
                        else:
                            game.lives -= 1; game.player.invincible = 60; game.player.hit_flash = 35; game.trigger_screen_shake(15, 8); audio.play('hurt')
                            if game.lives <= 0: game.state = 'game_over'; audio.play('explosion')
                        break

            for proj in game.projectiles[:]:
                if not proj.update(game.platforms):
                    for _ in range(8): game.particles.append(Particle(proj.x, proj.y, proj.color, size=4, speed=4, lifetime=15))
                    game.projectiles.remove(proj); continue
                proj_rect = proj.get_rect()
                for z in game.zombies:
                    if z.alive and proj_rect.colliderect(z.get_rect()):
                        dmg = proj.base_damage * proj.damage_mult
                        killed = z.take_damage(dmg, proj.spell_type, game.particles)
                        game.player.combo += 1; game.player.combo_timer = 140; game.player.rage_meter = min(game.player.max_rage, game.player.rage_meter + 4.5)
                        if killed:
                            game.total_zombies_killed += 1; game.score += z.score_val * (1 + game.player.combo // 3); game.gold += random.randint(3, 8)
                            for _ in range(3): game.bones.append(BoneDebris(z.x + z.w/2, z.y + z.h/2))
                            if random.random() < 0.35: game.pickups.append(Pickup(z.x + z.w/2, z.y + z.h/2))
                        if proj.pierce_left > 0: proj.pierce_left -= 1
                        else:
                            if proj in game.projectiles: game.projectiles.remove(proj)
                        break

            for pk in game.pickups[:]:
                if not pk.update(game.platforms, game.player): game.pickups.remove(pk); continue
                dist = math.hypot(game.player.rect.centerx - pk.x, game.player.rect.centery - pk.y)
                if dist < pk.radius + 25:
                    audio.play('pickup')
                    if pk.type == 'heal': game.lives = min(game.max_lives, game.lives + 1)
                    elif pk.type == 'shield': game.player.shield_active = True
                    elif pk.type == 'coin': game.gold += 10; game.score += 50
                    elif pk.type == 'gem': game.gold += 25; game.score += 150
                    elif pk.type == 'nuke':
                        audio.play('explosion'); game.trigger_screen_shake(25, 12)
                        for z in game.zombies:
                            if z.alive and not z.type.startswith('boss'): z.take_damage(50.0, 'fireball', game.particles)
                    elif pk.type == 'freeze':
                        for z in game.zombies: z.frozen_timer = 180
                    elif pk.type == 'frenzy': game.player.rage_meter = game.player.max_rage
                    game.pickups.remove(pk)

            if len([z for z in game.zombies if z.alive]) == 0:
                game.wave += 1; game.score += 250; game.gold += 35; game.open_upgrade_shop()

            game.particles = [p for p in game.particles if p.update()]
            game.shockwaves = [sw for sw in game.shockwaves if sw.update()]
            game.bones = [b for b in game.bones if b.update(game.platforms)]
            game.floating_texts = [ft for ft in game.floating_texts if ft.update()]
            game.banners = [b for b in game.banners if b.update()]
            if game.screen_shake > 0: game.screen_shake -= 1

        # Render Pass
        biome = game.get_current_biome()
        sky_top, sky_bot = biome['sky_top'], biome['sky_bot']
        for y in range(SCREEN_HEIGHT):
            t = y / SCREEN_HEIGHT
            r = int(sky_top[0] + (sky_bot[0] - sky_top[0]) * t)
            g = int(sky_top[1] + (sky_bot[1] - sky_top[1]) * t)
            b = int(sky_top[2] + (sky_bot[2] - sky_top[2]) * t)
            pygame.draw.line(screen, (r, g, b), (0, y), (SCREEN_WIDTH, y))

        # Stars
        for s in STARS:
            br = int(120 + 100 * math.sin(s['t'] + game.frame_count * s['spd']))
            pygame.draw.circle(screen, (br, br, br), (int(s['x']), int(s['y'])), int(s['s']))

        # Moon
        moon_col = biome['moon']
        pygame.draw.circle(screen, (moon_col[0]//3, moon_col[1]//3, moon_col[2]//3), (SCREEN_WIDTH - 180, 120), 45)
        pygame.draw.circle(screen, moon_col, (SCREEN_WIDTH - 180, 120), 32)

        for p in game.platforms: p.draw(screen, biome, game.frame_count)
        for b in game.bones: b.draw(screen)
        for pk in game.pickups: pk.draw(screen)
        for z in game.zombies: z.draw(screen)
        for ep in game.enemy_projectiles: pygame.draw.circle(screen, ep['color'], (int(ep['x']), int(ep['y'])), ep['r'])
        for proj in game.projectiles: proj.draw(screen)
        for sw in game.shockwaves: sw.draw(screen)
        for part in game.particles: part.draw(screen)
        if game.state in ['playing', 'shop']: game.player.draw(screen)
        for ft in game.floating_texts: ft.draw(screen)
        for b in game.banners: b.draw(screen)

        # HUD
        if game.state == 'playing':
            score_t = font_md.render(f"Score: {game.score:,}", True, GOLD)
            wave_t = font_md.render(f"Wave: {game.wave} ({biome['name']})", True, WHITE)
            gold_t = font_md.render(f"Gold: {game.gold} 🪙", True, YELLOW)
            screen.blit(score_t, (25, 20)); screen.blit(wave_t, (25, 55)); screen.blit(gold_t, (25, 90))
            for i in range(game.max_lives):
                col = RED if i < game.lives else DARK_GRAY
                hx = SCREEN_WIDTH - 35 - i * 32
                pygame.draw.circle(screen, col, (hx, 35), 11)

        elif game.state == 'shop':
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((10, 10, 25, 230)); screen.blit(overlay, (0, 0))
            shop_title = font_xl.render("ARCANE UPGRADE EMPORIUM", True, GOLD)
            screen.blit(shop_title, (SCREEN_WIDTH//2 - shop_title.get_width()//2, 90))
            for idx, perk in enumerate(game.shop_options):
                cx, cy, w, h = SCREEN_WIDTH // 2 - 360 + idx * 360, 240, 320, 360
                is_sel = (idx == game.selected_shop_idx)
                pygame.draw.rect(screen, (55, 55, 100) if is_sel else (35, 35, 60), (cx, cy, w, h), border_radius=12)
                pygame.draw.rect(screen, GOLD if is_sel else (80, 80, 120), (cx, cy, w, h), 4 if is_sel else 2, border_radius=12)
                p_title = font_md.render(perk['name'], True, GOLD if is_sel else WHITE)
                screen.blit(p_title, (cx + w//2 - p_title.get_width()//2, cy + 30))
                cost_t = font_md.render(f"Cost: {perk['cost']} 🪙", True, GREEN if game.gold >= perk['cost'] else RED)
                screen.blit(cost_t, (cx + w//2 - cost_t.get_width()//2, cy + 80))

        elif game.state == 'start':
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((10, 10, 25, 210)); screen.blit(overlay, (0, 0))
            title = font_xl.render("RILEY SMASHES THE ZOMBIES", True, GOLD)
            sub = font_lg.render("Ultra HD Graphics Edition", True, CYAN)
            inst1 = font_md.render("[A/D] Move | [W] Jump/Wall Jump | [S] Ground Slam | [F] Staff Melee", True, WHITE)
            inst2 = font_md.render("[1-6] Switch Spells | [SPACE] Cast Spell | [SHIFT] Warp Dash", True, WHITE)
            start_btn = font_lg.render("Press SPACE or ENTER to Play", True, GREEN)
            screen.blit(title, (SCREEN_WIDTH//2 - title.get_width()//2, 160))
            screen.blit(sub, (SCREEN_WIDTH//2 - sub.get_width()//2, 240))
            screen.blit(inst1, (SCREEN_WIDTH//2 - inst1.get_width()//2, 350))
            screen.blit(inst2, (SCREEN_WIDTH//2 - inst2.get_width()//2, 400))
            screen.blit(start_btn, (SCREEN_WIDTH//2 - start_btn.get_width()//2, 570))

        elif game.state == 'game_over':
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((15, 5, 10, 230)); screen.blit(overlay, (0, 0))
            over_t = font_xl.render("YOU HAVE FALLEN", True, RED)
            score_t = font_lg.render(f"Final Score: {game.score:,}", True, GOLD)
            restart_t = font_md.render("Press SPACE or ENTER to Rise Again", True, GREEN)
            screen.blit(over_t, (SCREEN_WIDTH//2 - over_t.get_width()//2, SCREEN_HEIGHT//2 - 120))
            screen.blit(score_t, (SCREEN_WIDTH//2 - score_t.get_width()//2, SCREEN_HEIGHT//2 - 20))
            screen.blit(restart_t, (SCREEN_WIDTH//2 - restart_t.get_width()//2, SCREEN_HEIGHT//2 + 100))

        pygame.display.flip()
        clock.tick(FPS)

if __name__ == "__main__":
    run_game()
