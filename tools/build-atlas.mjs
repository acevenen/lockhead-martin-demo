#!/usr/bin/env node
/**
 * Combines data/world-sites.json (coords) + data/world-elevation.json (REAL
 * sampled terrain) + the styling table below into js/atlas.js, which the demo
 * loads as a plain script so it still runs from file://.
 *
 * Usage: node tools/build-atlas.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sites = JSON.parse(readFileSync(join(root, 'data', 'world-sites.json'), 'utf8'));
const elev = JSON.parse(readFileSync(join(root, 'data', 'world-elevation.json'), 'utf8'));

/* ---------------------------------------------------------------------------
   STYLING TABLE — what actually makes each place look like itself.

   layout    grid | radial | organic | dense | superblock | colonial | canal | none
   block     mean block size in metres (drives street spacing)
   rot       street-grid bearing in degrees (Manhattan really is ~29 deg off north)
   peak      tallest structure in metres
   falloff   how fast height drops from the core (low = flat skyline, high = spike)
   density   0..1 coverage of the built footprint
   water     coast | river | lagoon | lake | delta | harbour | none
   veg       0..1 how green the surroundings read
   --------------------------------------------------------------------------- */
const STYLE = {
  denver:        { layout:'grid',       block:130, rot:0,   peak:216, falloff:1.5, density:.62, water:'river',  veg:.45, biome:'semiarid',
                   pal:{ground:'#8a7d63',city:'#7fd4ff',accent:'#ffb454',water:'#3f9fd0',veg:'#4f9b62'},
                   landmark:{name:'STATE CAPITOL',type:'dome',h:80} },
  newyork:       { layout:'grid',       block:80,  rot:29,  peak:541, falloff:2.6, density:.88, water:'harbour',veg:.22, biome:'temperate',
                   pal:{ground:'#6b6f74',city:'#cfe6ff',accent:'#ffcf5c',water:'#2f6d99',veg:'#3f7a48'},
                   landmark:{name:'EMPIRE STATE',type:'spire',h:443} },
  sanfrancisco:  { layout:'grid',       block:100, rot:15,  peak:326, falloff:2.2, density:.70, water:'harbour',veg:.32, biome:'mediterranean',
                   pal:{ground:'#9a8f74',city:'#e8dcc8',accent:'#e2643c',water:'#2d7ba8',veg:'#5c8a52'},
                   landmark:{name:'GOLDEN GATE',type:'bridge',h:227} },
  chicago:       { layout:'grid',       block:100, rot:0,   peak:442, falloff:2.4, density:.78, water:'lake',   veg:.28, biome:'temperate',
                   pal:{ground:'#7d7a6c',city:'#bcd6e8',accent:'#d64f4f',water:'#3f86b8',veg:'#4a8250'},
                   landmark:{name:'WILLIS TOWER',type:'tower',h:442} },
  losangeles:    { layout:'grid',       block:150, rot:8,   peak:335, falloff:1.2, density:.55, water:'coast',  veg:.30, biome:'mediterranean',
                   pal:{ground:'#b8a179',city:'#ffe4c0',accent:'#ff8f4a',water:'#2f8fc4',veg:'#6b9455'},
                   landmark:{name:'US BANK TOWER',type:'tower',h:310} },
  vancouver:     { layout:'grid',       block:110, rot:22,  peak:201, falloff:1.7, density:.60, water:'harbour',veg:.72, biome:'temperate',
                   pal:{ground:'#5f7060',city:'#bfe4f0',accent:'#5ad0a8',water:'#2d7f9e',veg:'#2f7a4a'},
                   landmark:{name:'HARBOUR CENTRE',type:'tower',h:177} },
  mexicocity:    { layout:'colonial',   block:120, rot:8,   peak:246, falloff:1.4, density:.80, water:'none',   veg:.30, biome:'highland',
                   pal:{ground:'#9c8163',city:'#f0d9b8',accent:'#e2544a',water:'#3f8fb0',veg:'#5f8f4f'},
                   landmark:{name:'TORRE LATINO',type:'tower',h:182} },
  riodejaneiro:  { layout:'organic',    block:95,  rot:0,   peak:164, falloff:1.6, density:.66, water:'harbour',veg:.68, biome:'tropical',
                   pal:{ground:'#8f7a5c',city:'#ffe9d0',accent:'#3fd18f',water:'#1f9bc4',veg:'#2f8f4f'},
                   landmark:{name:'CHRIST THE REDEEMER',type:'statue',h:38} },
  buenosaires:   { layout:'colonial',   block:110, rot:35,  peak:235, falloff:1.5, density:.78, water:'river',  veg:.34, biome:'temperate',
                   pal:{ground:'#8c8468',city:'#eadfc8',accent:'#5fb8e0',water:'#5f8fa8',veg:'#4f8a52'},
                   landmark:{name:'OBELISCO',type:'obelisk',h:67} },
  lima:          { layout:'colonial',   block:120, rot:20,  peak:120, falloff:1.2, density:.68, water:'coast',  veg:.14, biome:'desert',
                   pal:{ground:'#a89476',city:'#e8d8bc',accent:'#e0a04a',water:'#2f7f9e',veg:'#6f8f52'},
                   landmark:{name:'PLAZA MAYOR',type:'plaza',h:40} },
  santiago:      { layout:'grid',       block:110, rot:12,  peak:300, falloff:1.9, density:.68, water:'river',  veg:.32, biome:'mediterranean',
                   pal:{ground:'#9a8a68',city:'#e4dcc4',accent:'#e05a4a',water:'#4f8fb0',veg:'#5a8a4a'},
                   landmark:{name:'GRAN TORRE',type:'tower',h:300} },
  bogota:        { layout:'colonial',   block:100, rot:0,   peak:196, falloff:1.4, density:.72, water:'none',   veg:.44, biome:'highland',
                   pal:{ground:'#7f7a5c',city:'#e0d4b8',accent:'#e8b04a',water:'#4f8fa8',veg:'#3f8a4f'},
                   landmark:{name:'TORRE COLPATRIA',type:'tower',h:196} },
  machupicchu:   { layout:'none',       block:0,   rot:0,   peak:12,  falloff:0,   density:.04, water:'river',  veg:.62, biome:'alpine',
                   pal:{ground:'#6f7f5f',city:'#c8bfa0',accent:'#d8b054',water:'#4f9fb8',veg:'#3f7f4a'},
                   landmark:{name:'CITADEL',type:'ruins',h:12} },
  paris:         { layout:'radial',     block:90,  rot:0,   peak:210, falloff:0.5, density:.86, water:'river',  veg:.30, biome:'temperate',
                   pal:{ground:'#8f8a7c',city:'#d8d2c4',accent:'#c8a24a',water:'#5f8fa8',veg:'#4f8250'},
                   landmark:{name:'EIFFEL TOWER',type:'lattice',h:330} },
  london:        { layout:'organic',    block:85,  rot:0,   peak:310, falloff:1.9, density:.74, water:'river',  veg:.38, biome:'temperate',
                   pal:{ground:'#77786c',city:'#c4c8cc',accent:'#c44a4a',water:'#4f7f96',veg:'#4a7f4a'},
                   landmark:{name:'ELIZABETH TOWER',type:'tower',h:96} },
  barcelona:     { layout:'grid',       block:113, rot:45,  peak:144, falloff:0.9, density:.84, water:'coast',  veg:.26, biome:'mediterranean',
                   pal:{ground:'#a08462',city:'#e8c9a0',accent:'#d8642f',water:'#2f8fb8',veg:'#5f8a4a'},
                   landmark:{name:'SAGRADA FAMILIA',type:'spires',h:172} },
  venice:        { layout:'canal',      block:55,  rot:0,   peak:99,  falloff:0.7, density:.80, water:'lagoon', veg:.10, biome:'mediterranean',
                   pal:{ground:'#8f7f6a',city:'#e0c0a0',accent:'#c4903f',water:'#3f96b0',veg:'#5f8a5a'},
                   landmark:{name:'ST MARKS CAMPANILE',type:'campanile',h:99} },
  rome:          { layout:'organic',    block:80,  rot:0,   peak:136, falloff:0.8, density:.80, water:'river',  veg:.32, biome:'mediterranean',
                   pal:{ground:'#9c8763',city:'#e0c49c',accent:'#c4703f',water:'#5f9098',veg:'#5a8a4f'},
                   landmark:{name:'COLOSSEUM',type:'amphitheatre',h:48} },
  athens:        { layout:'organic',    block:75,  rot:0,   peak:103, falloff:0.9, density:.82, water:'coast',  veg:.22, biome:'mediterranean',
                   pal:{ground:'#a89a76',city:'#eee6d4',accent:'#3f9fd8',water:'#2f9fc8',veg:'#6f8f52'},
                   landmark:{name:'THE PARTHENON',type:'temple',h:14} },
  amsterdam:     { layout:'canal',      block:70,  rot:0,   peak:100, falloff:0.6, density:.78, water:'lagoon', veg:.34, biome:'temperate',
                   pal:{ground:'#77806f',city:'#c8a884',accent:'#e0704a',water:'#4f8fa0',veg:'#4a8250'},
                   landmark:{name:'WESTERKERK',type:'campanile',h:87} },
  reykjavik:     { layout:'organic',    block:90,  rot:0,   peak:74,  falloff:0.8, density:.44, water:'coast',  veg:.20, biome:'subpolar',
                   pal:{ground:'#6f7076',city:'#dfe8ee',accent:'#5fc8e0',water:'#3f7f9e',veg:'#4f7f5a'},
                   landmark:{name:'HALLGRIMSKIRKJA',type:'spire',h:74} },
  bergen:        { layout:'organic',    block:70,  rot:0,   peak:60,  falloff:0.7, density:.42, water:'coast',  veg:.66, biome:'subpolar',
                   pal:{ground:'#5f6b5c',city:'#e0c8a8',accent:'#e0704a',water:'#2f6f8f',veg:'#2f7047'},
                   landmark:{name:'BRYGGEN WHARF',type:'row',h:20} },
  istanbul:      { layout:'organic',    block:80,  rot:0,   peak:369, falloff:1.5, density:.80, water:'harbour',veg:.30, biome:'mediterranean',
                   pal:{ground:'#8f8468',city:'#dcc8a8',accent:'#c8a03f',water:'#2f8fa8',veg:'#4f8a4f'},
                   landmark:{name:'HAGIA SOPHIA',type:'dome',h:55} },
  moscow:        { layout:'radial',     block:120, rot:0,   peak:374, falloff:2.0, density:.72, water:'river',  veg:.36, biome:'continental',
                   pal:{ground:'#77746a',city:'#d8d0c0',accent:'#c4413f',water:'#5f8298',veg:'#3f7a48'},
                   landmark:{name:'ST BASILS',type:'onion',h:65} },
  zurich:        { layout:'organic',    block:80,  rot:0,   peak:126, falloff:0.9, density:.62, water:'lake',   veg:.52, biome:'alpine',
                   pal:{ground:'#7f8068',city:'#dcd4c0',accent:'#c4a03f',water:'#3f96b8',veg:'#3f8250'},
                   landmark:{name:'GROSSMUNSTER',type:'twin',h:62} },
  zermatt:       { layout:'none',       block:60,  rot:0,   peak:30,  falloff:0.4, density:.10, water:'none',   veg:.40, biome:'alpine',
                   pal:{ground:'#8f96a0',city:'#c8b89c',accent:'#e0e8f0',water:'#5fa8c8',veg:'#3f7250'},
                   landmark:{name:'MATTERHORN',type:'peak',h:4478} },
  cairo:         { layout:'organic',    block:90,  rot:0,   peak:187, falloff:1.3, density:.84, water:'river',  veg:.12, biome:'desert',
                   pal:{ground:'#c4a674',city:'#e8d4a8',accent:'#d8a03f',water:'#3f8fa8',veg:'#5f8a3f'},
                   landmark:{name:'GREAT PYRAMID',type:'pyramid',h:139} },
  capetown:      { layout:'grid',       block:100, rot:20,  peak:139, falloff:1.3, density:.56, water:'coast',  veg:.44, biome:'mediterranean',
                   pal:{ground:'#9a8a6c',city:'#e4dcc8',accent:'#e0a04a',water:'#2f8fb8',veg:'#4f8a52'},
                   landmark:{name:'TABLE MOUNTAIN',type:'mesa',h:1085} },
  marrakesh:     { layout:'organic',    block:45,  rot:0,   peak:77,  falloff:0.5, density:.88, water:'none',   veg:.18, biome:'desert',
                   pal:{ground:'#c08a5c',city:'#d8834f',accent:'#e8c04a',water:'#3f8fa8',veg:'#5f8a3f'},
                   landmark:{name:'KOUTOUBIA',type:'minaret',h:77} },
  nairobi:       { layout:'grid',       block:110, rot:15,  peak:200, falloff:1.5, density:.58, water:'river',  veg:.54, biome:'highland',
                   pal:{ground:'#9c8760',city:'#e0d0b0',accent:'#e08a3f',water:'#4f96a8',veg:'#4f8a3f'},
                   landmark:{name:'KICC TOWER',type:'tower',h:105} },
  lagos:         { layout:'organic',    block:80,  rot:0,   peak:160, falloff:1.4, density:.86, water:'lagoon', veg:.40, biome:'tropical',
                   pal:{ground:'#8f8258',city:'#e4d4a8',accent:'#3fc88f',water:'#2f96a8',veg:'#2f8a4a'},
                   landmark:{name:'CIVIC TOWER',type:'tower',h:120} },
  addisababa:    { layout:'organic',    block:100, rot:0,   peak:198, falloff:1.3, density:.62, water:'none',   veg:.42, biome:'highland',
                   pal:{ground:'#9c8462',city:'#e0cfae',accent:'#e0b03f',water:'#4f96a8',veg:'#4f8a4a'},
                   landmark:{name:'MERKATO',type:'plaza',h:60} },
  sahara:        { layout:'none',       block:0,   rot:0,   peak:0,   falloff:0,   density:0,   water:'none',   veg:.02, biome:'desert',
                   pal:{ground:'#d8a860',city:'#e8c88f',accent:'#ffd47a',water:'#3f8fa8',veg:'#8f9a4a'},
                   landmark:{name:'ERG CHEBBI DUNES',type:'dunes',h:150} },
  tokyo:         { layout:'dense',      block:60,  rot:0,   peak:325, falloff:1.1, density:.92, water:'harbour',veg:.24, biome:'temperate',
                   pal:{ground:'#7a7c80',city:'#dfe6ec',accent:'#ff4f6f',water:'#3f7f9e',veg:'#4a8250'},
                   landmark:{name:'TOKYO SKYTREE',type:'lattice',h:634} },
  hongkong:      { layout:'dense',      block:55,  rot:0,   peak:484, falloff:2.4, density:.90, water:'harbour',veg:.46, biome:'subtropical',
                   pal:{ground:'#6f7a68',city:'#cfe8f4',accent:'#ff9f3f',water:'#2f8fa8',veg:'#2f8250'},
                   landmark:{name:'ICC TOWER',type:'tower',h:484} },
  singapore:     { layout:'superblock', block:180, rot:0,   peak:290, falloff:1.6, density:.70, water:'coast',  veg:.62, biome:'tropical',
                   pal:{ground:'#6f8060',city:'#dcecf4',accent:'#3fd8b0',water:'#2f9fb8',veg:'#2f8a52'},
                   landmark:{name:'MARINA BAY SANDS',type:'triple',h:200} },
  dubai:         { layout:'superblock', block:220, rot:35,  peak:828, falloff:3.4, density:.42, water:'coast',  veg:.08, biome:'desert',
                   pal:{ground:'#d8b880',city:'#e8f0f8',accent:'#c8a03f',water:'#2f9fc8',veg:'#6f9a4a'},
                   landmark:{name:'BURJ KHALIFA',type:'spire',h:828} },
  mumbai:        { layout:'dense',      block:65,  rot:0,   peak:280, falloff:1.7, density:.92, water:'coast',  veg:.26, biome:'tropical',
                   pal:{ground:'#9c8760',city:'#e4d0ac',accent:'#e0703f',water:'#2f8fa8',veg:'#3f8a4a'},
                   landmark:{name:'GATEWAY OF INDIA',type:'arch',h:26} },
  seoul:         { layout:'dense',      block:70,  rot:0,   peak:555, falloff:2.2, density:.86, water:'river',  veg:.42, biome:'temperate',
                   pal:{ground:'#77807a',city:'#d8e4ec',accent:'#4fb8e0',water:'#3f8298',veg:'#3f8250'},
                   landmark:{name:'LOTTE WORLD TOWER',type:'spire',h:555} },
  bangkok:       { layout:'organic',    block:75,  rot:0,   peak:314, falloff:1.8, density:.84, water:'delta',  veg:.36, biome:'tropical',
                   pal:{ground:'#8f8a5c',city:'#e8dcb0',accent:'#e0a83f',water:'#3f96a0',veg:'#3f8a48'},
                   landmark:{name:'WAT ARUN',type:'prang',h:82} },
  shanghai:      { layout:'superblock', block:200, rot:0,   peak:632, falloff:2.8, density:.76, water:'river',  veg:.28, biome:'subtropical',
                   pal:{ground:'#77786e',city:'#d4e4f0',accent:'#ff6f4f',water:'#4f8298',veg:'#3f7f4a'},
                   landmark:{name:'SHANGHAI TOWER',type:'twist',h:632} },
  kathmandu:     { layout:'organic',    block:50,  rot:0,   peak:60,  falloff:0.6, density:.80, water:'river',  veg:.42, biome:'alpine',
                   pal:{ground:'#9c8a62',city:'#dcc09c',accent:'#d8703f',water:'#4f96a8',veg:'#4a8a4a'},
                   landmark:{name:'BOUDHANATH STUPA',type:'stupa',h:36} },
  jerusalem:     { layout:'organic',    block:60,  rot:0,   peak:60,  falloff:0.5, density:.74, water:'none',   veg:.24, biome:'mediterranean',
                   pal:{ground:'#bca878',city:'#e8dcc0',accent:'#d8b84a',water:'#4f96a8',veg:'#5f8a4a'},
                   landmark:{name:'DOME OF THE ROCK',type:'dome',h:35} },
  everest:       { layout:'none',       block:0,   rot:0,   peak:0,   falloff:0,   density:0,   water:'none',   veg:.06, biome:'polar',
                   pal:{ground:'#8f98a4',city:'#e8f0f8',accent:'#c8e4f8',water:'#5fa8c8',veg:'#4f7250'},
                   landmark:{name:'SAGARMATHA',type:'peak',h:8849} },
  sydney:        { layout:'organic',    block:100, rot:0,   peak:305, falloff:1.9, density:.62, water:'harbour',veg:.44, biome:'temperate',
                   pal:{ground:'#9a8f6a',city:'#e0e8ec',accent:'#3fc8d8',water:'#2f9fc4',veg:'#4a8a4a'},
                   landmark:{name:'SYDNEY OPERA HOUSE',type:'shells',h:65} },
  auckland:      { layout:'organic',    block:95,  rot:0,   peak:328, falloff:2.1, density:.50, water:'harbour',veg:.58, biome:'temperate',
                   pal:{ground:'#6f7f60',city:'#dce8ee',accent:'#4fc8a0',water:'#2f8fb0',veg:'#2f8250'},
                   landmark:{name:'SKY TOWER',type:'spire',h:328} },
  honolulu:      { layout:'grid',       block:110, rot:30,  peak:130, falloff:1.2, density:.52, water:'coast',  veg:.62, biome:'tropical',
                   pal:{ground:'#8f8a5f',city:'#f0e4cc',accent:'#3fd8c0',water:'#1fa8c8',veg:'#2f8a4f'},
                   landmark:{name:'DIAMOND HEAD',type:'crater',h:232} },
  grandcanyon:   { layout:'none',       block:0,   rot:0,   peak:0,   falloff:0,   density:0,   water:'river',  veg:.18, biome:'desert',
                   pal:{ground:'#b8703f',city:'#d8a068',accent:'#e8a83f',water:'#3f8fa8',veg:'#5f7f42'},
                   landmark:{name:'SOUTH RIM',type:'canyon',h:1600} },
  monumentvalley:{ layout:'none',       block:0,   rot:0,   peak:0,   falloff:0,   density:0,   water:'none',   veg:.10, biome:'desert',
                   pal:{ground:'#c07048',city:'#d89060',accent:'#e8a03f',water:'#3f8fa8',veg:'#6f7f42'},
                   landmark:{name:'THE MITTENS',type:'butte',h:300} },
  amazon:        { layout:'organic',    block:90,  rot:0,   peak:60,  falloff:0.6, density:.30, water:'river',  veg:.95, biome:'tropical',
                   pal:{ground:'#4f6f3f',city:'#d8c8a0',accent:'#5fd86f',water:'#3f7f6f',veg:'#1f7a3a'},
                   landmark:{name:'RIO NEGRO CONFLUENCE',type:'river',h:0} },
  mcmurdo:       { layout:'none',       block:80,  rot:0,   peak:20,  falloff:0.3, density:.06, water:'coast',  veg:0,   biome:'polar',
                   pal:{ground:'#c8dae8',city:'#e8f4ff',accent:'#5fc8f0',water:'#2f6f9e',veg:'#8fa8b8'},
                   landmark:{name:'MT EREBUS',type:'volcano',h:3794} },
};


/* ---------------------------------------------------------------------------
   HEIGHT PROFILES — empirical, from GHSL 2024 satellite-derived building
   heights and the standard negative-exponential urban height gradient:
       h(r) = hFloor + (hCore - hFloor) * exp(-r / L)
   The headline finding is that background fabric is far lower than intuition
   (London averages 7.3 m, Seoul 14.1 m). What separates skylines is the floor,
   the core, how fast you get between them, and how rare the spikes are.
   --------------------------------------------------------------------------- */
const PROFILES = {
  PEAK_BIMODAL:     { hFloor:25,  hCore:150, L:2.5, sigma:.75, pSpike:.020, spike:2.5 },
  WALL:             { hFloor:90,  hCore:180, L:4.0, sigma:.45, pSpike:.010, spike:2.7 },
  UNIFORM_CAP:      { hFloor:15,  hCore:22,  L:99,  sigma:.12, pSpike:.001, spike:8  },
  ISOLATED_SPIKE:   { hFloor:10,  hCore:25,  L:1.0, sigma:.60, pSpike:.004, spike:20 },
  LOW_PLUS_CLUSTER: { hFloor:7.3, hCore:20,  L:6.0, sigma:.50, pSpike:.0008,spike:15 },
  PLATEAU_MID:      { hFloor:15,  hCore:45,  L:8.0, sigma:.35, pSpike:.010, spike:6  },
  SPRAWL_FLAT:      { hFloor:6,   hCore:30,  L:1.5, sigma:.50, pSpike:.001, spike:4  },
  MEGA_LOW:         { hFloor:3.4, hCore:18,  L:2.0, sigma:.70, pSpike:.0005,spike:5  },
  SLAB_UNIFORM:     { hFloor:18,  hCore:40,  L:5.0, sigma:.30, pSpike:.002, spike:8  },
  TERRACED_HILL:    { hFloor:6,   hCore:60,  L:2.0, sigma:.55, pSpike:.002, spike:3  },
  MID_CORE:         { hFloor:12,  hCore:70,  L:3.0, sigma:.50, pSpike:.006, spike:5  },
  LOW_ORGANIC:      { hFloor:8,   hCore:24,  L:2.4, sigma:.45, pSpike:.001, spike:4  },
  WILDERNESS:       { hFloor:0,   hCore:0,   L:1,   sigma:0,   pSpike:0,    spike:1  },
};

/* Roof colour distributions — weighted triples. Roof colour carries most of the
   aerial read of a city, so this is the cheapest identity lever there is. */
const ROOFS = {
  paris:      [['#6E7377',.85],['#4A4F55',.10],['#B5603C',.05]],
  barcelona:  [['#B5603C',.80],['#CBB89A',.14],['#D8B87A',.06]],
  rome:       [['#A8532E',.78],['#C97B3F',.16],['#E0D5BE',.06]],
  athens:     [['#DED8C8',.70],['#EFEDE6',.24],['#3A6EA5',.06]],
  tokyo:      [['#7E8B99',.62],['#B8BCC0',.30],['#4C6C8C',.08]],
  seoul:      [['#3F7A4E',.55],['#A8ABAE',.37],['#C05A3E',.08]],
  hongkong:   [['#8E9295',.70],['#C8C3B4',.24],['#5E8C7E',.06]],
  marrakesh:  [['#A8552F',.72],['#C4633C',.24],['#2F6E8C',.04]],
  cairo:      [['#B8AA8E',.60],['#9C5B41',.34],['#C2A87C',.06]],
  amsterdam:  [['#3E3A38',.62],['#7A3B2E',.32],['#EDEAE3',.06]],
  london:     [['#4A4E52',.66],['#8B5A46',.28],['#C4AE8A',.06]],
  reykjavik:  [['#C0392B',.36],['#2E6DA4',.34],['#3E8C63',.30]],
  bergen:     [['#C0392B',.40],['#E8E6E1',.36],['#2E6DA4',.24]],
  moscow:     [['#5C6B5E',.52],['#A0A2A0',.36],['#C79A3C',.12]],
  istanbul:   [['#A85B3A',.68],['#D6C6A8',.24],['#7A8085',.08]],
  mexicocity: [['#9E9A93',.58],['#C98F4C',.34],['#7E3B34',.08]],
  riodejaneiro:[['#B0553A',.60],['#E4DDCE',.34],['#2F5D3A',.06]],
  buenosaires:[['#5C6066',.62],['#C9C6BE',.32],['#6EA8C4',.06]],
  dubai:      [['#DEDAD2',.60],['#D9C39A',.32],['#C7A24C',.08]],
  mumbai:     [['#3E6FA8',.44],['#8C4A2F',.38],['#B0AA9E',.18]],
  lagos:      [['#8A4B31',.62],['#A9A395',.30],['#9E5535',.08]],
  capetown:   [['#B2603A',.58],['#EFEBE2',.36],['#4A5F3E',.06]],
  bangkok:    [['#C8622F',.52],['#B4AFA4',.40],['#C9A227',.08]],
  singapore:  [['#EFEDE6',.62],['#D8D4CA',.32],['#4C7A5A',.06]],
  newyork:    [['#4A4A4A',.58],['#8B5A46',.34],['#B8B4AC',.08]],
  venice:     [['#A8532E',.80],['#C97B3F',.16],['#7A8085',.04]],
  jerusalem:  [['#BCA878',.70],['#E8DCC0',.24],['#D8B84A',.06]],
  kathmandu:  [['#9C5B41',.58],['#DCC09C',.34],['#D8703F',.08]],
};
const DEFAULT_ROOFS = [['#8a8378',.60],['#a89a86',.30],['#6f7a80',.10]];

/* which empirical profile each site follows */
const PROF = {
  newyork:'PEAK_BIMODAL', chicago:'PEAK_BIMODAL',
  hongkong:'WALL',
  paris:'UNIFORM_CAP', venice:'UNIFORM_CAP', amsterdam:'UNIFORM_CAP', jerusalem:'UNIFORM_CAP',
  dubai:'ISOLATED_SPIKE', doha:'ISOLATED_SPIKE',
  london:'LOW_PLUS_CLUSTER', rome:'LOW_PLUS_CLUSTER', athens:'LOW_PLUS_CLUSTER',
  seoul:'PLATEAU_MID', singapore:'PLATEAU_MID', tokyo:'PLATEAU_MID', shanghai:'PLATEAU_MID',
  losangeles:'SPRAWL_FLAT', cairo:'SPRAWL_FLAT', lagos:'SPRAWL_FLAT', nairobi:'SPRAWL_FLAT',
  lima:'MEGA_LOW', addisababa:'MEGA_LOW', amazon:'MEGA_LOW',
  moscow:'SLAB_UNIFORM',
  riodejaneiro:'TERRACED_HILL', bogota:'TERRACED_HILL', santiago:'TERRACED_HILL', kathmandu:'TERRACED_HILL',
  denver:'MID_CORE', sanfrancisco:'MID_CORE', vancouver:'MID_CORE', mexicocity:'MID_CORE',
  buenosaires:'MID_CORE', barcelona:'MID_CORE', istanbul:'MID_CORE', capetown:'MID_CORE',
  mumbai:'MID_CORE', bangkok:'MID_CORE', sydney:'MID_CORE', auckland:'MID_CORE',
  honolulu:'MID_CORE', zurich:'MID_CORE',
  marrakesh:'LOW_ORGANIC', reykjavik:'LOW_ORGANIC', bergen:'LOW_ORGANIC',
  machupicchu:'WILDERNESS', zermatt:'WILDERNESS', sahara:'WILDERNESS', everest:'WILDERNESS',
  grandcanyon:'WILDERNESS', monumentvalley:'WILDERNESS', mcmurdo:'WILDERNESS',
};

const DEFAULT_STYLE = { layout:'grid', block:100, rot:0, peak:150, falloff:1.4, density:.6,
  water:'none', veg:.4, biome:'temperate',
  pal:{ground:'#8a7d63',city:'#7fd4ff',accent:'#ffb454',water:'#3f9fd0',veg:'#4f9b62'},
  landmark:{name:'CITY CENTRE',type:'tower',h:120} };

const hex = s => parseInt(s.slice(1), 16);

const out = sites.map(s => {
  const st = STYLE[s.id] || DEFAULT_STYLE;
  const e = elev[s.id];
  if (!e) throw new Error('no elevation for ' + s.id);
  return {
    id: s.id, name: s.name, sub: s.sub, country: s.country, region: s.region,
    lat: s.lat, lon: s.lon,
    layout: st.layout, block: st.block, rot: st.rot, peak: st.peak,
    falloff: st.falloff, density: st.density, water: st.water, veg: st.veg,
    biome: st.biome,
    pal: { ground: hex(st.pal.ground), city: hex(st.pal.city), accent: hex(st.pal.accent),
           water: hex(st.pal.water), veg: hex(st.pal.veg) },
    landmark: st.landmark,
    prof: PROFILES[PROF[s.id] || 'MID_CORE'],
    profName: PROF[s.id] || 'MID_CORE',
    roofs: (ROOFS[s.id] || DEFAULT_ROOFS).map(r => [hex(r[0]), r[1]]),
    chamfer: s.id === 'barcelona',
    elevMin: e.min, elevMax: e.max, elevN: e.n, spanKm: e.spanKm,
    elev: e.grid,
  };
});

const missing = sites.filter(s => !STYLE[s.id]).map(s => s.id);
if (missing.length) console.warn('WARN using default style for:', missing.join(', '));

const banner = `/* GENERATED by tools/build-atlas.mjs — do not edit by hand.
   ${out.length} sites. Elevation grids are REAL samples from opentopodata
   (ETOPO1), fetched at build time so the demo still runs air-gapped. */\n`;
const js = banner + 'window.AegisAtlas = ' + JSON.stringify(out) + ';\n';
const path = join(root, 'js', 'atlas.js');
writeFileSync(path, js);
console.log(`wrote ${path} — ${out.length} sites, ${(js.length / 1024).toFixed(0)} KB`);
