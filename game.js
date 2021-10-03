"use strict";
//NOTE: boilerplate code is from https://github.com/ixchow/amoeba-escape/
//   (which, in turn, uses code from the TCHOW 2016 New Year's card "pins & noodles")

let ctx = null;

const HEX_WIDTH = 22; //step from one column of hexes to the next
const HEX_HEIGHT = 19; //step from one row of hexes to the next

const STEP_TIME = 1.0; //time for sables to take one step

/*
const AUDIO = {
	click:"click.wav",
	move:"grund.wav",
	winLevel:"fin.wav",
	winGame:"end.wav"
};
(function loadAudio(){
	for (let n in AUDIO) {
		let a = new Audio();
		a.src = AUDIO[n];
		AUDIO[n] = a;
		a.oneshot = function() {
			this.pause();
			this.currentTime = 0;
			this.play();
		};
	}
})();
*/

let mouse = { x:NaN, y:NaN };

let board = {
	size:{x:4, y:5},
	//ground tiles; origin lower-left, odd rows +1/2 hex
	ground:[
		[null, null],
	],
	//rock area, 'true' where rocks can go, false otherwise:
	rockArea:[
		[true, true],
		[false, true]
	],
	//rocks:
	rocks:[
		{
			sprite:SPRITES.rock,
			x:2, y:3,
			from:{x:1,y:2}, //for animation
			//shove:{x:,y:} (shoved by player)
		},
	],
	//sables:
	sables:[
		{
			bodyLength:3,
			tailLength:2,
			pts:[
				{x:3, y:1}, //head
				{x:2, y:1},{x:1, y:1},{x:1,y:2}, //body
				{x:0, y:2}, {x:0,y:3} //tail
			],
			//pts get marked as 'exited:true' when exited
			from:[
				//... for animation ...
			],
			//actions from player:
			//pulled:true
			//held:true

			//next actions might include:
			//next:{x,y} (new pts[0])
			//prev:{x,y} (new pts[pts.length-1])
			//barking:{i:, of:} //barking at 'next'
			//biting:true //biting a tail at 'next'
			//bitten:[ ... ] //list of biters
		},
	],
	//for drawing:
	tween:1.0, //how far from [from .. pts] to draw sables
};

let loop = 0.0;
let breathe = 0.0;

let picture = null;
let isEnd = false;

let undoStack = [];

//Body: ['⇦', '⬃', '⬂', '⇨', '⬀', '⬁']
//Tail: ['🡐', '🡗', '🡖', '🡒', '🡕', '🡔']

const LEVELS = [
	{ title:"title", picture:SPRITES.PICTURES.title},
	/*{ title:"test", board:[
		"@ @ 🡗 @ @ _ @",
		" . ⇨ ⇨ o # _ X X X X X X",
		"@ @ @ @ @ @ @",
	]},*/
	{ title:"get sables to the exit", board:[
		"@ @ @ @ @ @ @",
		" @ 🡗 🡐 @ . . @",
		"@ ⬂ @ @ . @ X",
		" @ ⇨ o . @ @ ",
		"@ @ @ @ @ @ @",
	]},
	{ title:"move rocks to clear the path", board:[
		"@ @ @ @ @ @ @",
		" @ o . # . X ",
		"@ ⬀ @ @ _ @ @",
		" @ ⬁ @ @ @ @ ",
		"@ @ 🡔 🡐 @ @ @",
		" @ @ @ @ @ @ ",
	]},
	{ title:"sables turn at obstacles", board:[
		"@ @ @ @ @ @ @",
		" @ @ 🡗 . @ @ @",
		"@ @ 🡗 . _ # @",
		" @ ⬂ . . _ _ @",
		"@ @ ⇨ o . # @",
		" @ @ @ . . . @",
		"@ @ X . . . @",
		" @ @ @ @ @ @ @",
	]},
	{ title:"you can pull tails", board:[
		"@ @ @ @ @ @ @ @ @ ",
		" @ @ @ @ @ @ @ @ @",
		"@ @ @ @ @ . @ @ @ ",
		" @ @ @ @ @ o . @ @",
		"@ . 🡒 🡒 ⇨ ⬀ . X @ ",
		" @ @ @ @ @ @ @ @ @",
	]},
	{ title:"sables bite", board:[
		"@ @ @ @ @ @ @ @ @ @ @ ",
		" @ @ @ @ @ @ @ X @ @ @",
		"@ @ @ @ @ @ @ . @ @ @ ",
		" @ . 🡒 🡖 @ @ . @ @ @ @",
		"@ @ . . ⬂ @ @ . @ @ @ ",
		" @ @ . @ ⇨ o o @ @ @ @",
		"@ @ @ . @ @ ⬀ @ @ @ @ ",
		" @ @ @ 🡒 🡒 ⬀ @ @ @ @ @",
		"@ @ @ @ @ @ @ @ @ @ @ ",
	]},
	{ title:"sables argue", board:[
		"@ @ @ @ @ @ @ @ @ @ @ ",
		" @ @ @ @ @ @ @ @ @ @ @",
		"@ @ @ @ 🡖 @ @ @ @ @ @ ",
		" @ @ @ @ 🡗 @ @ @ @ @ @",
		"@ @ @ @ ⬂ @ @ @ ⬃ ⇦ @ ",
		" @ @ @ @ ⇨ o @ o @ 🡔 @",
		"@ @ @ @ @ @ . . @ 🡕 @ ",
		" @ @ @ @ X @ . @ @ . @",
		"@ @ @ @ @ . . @ @ . @ ",
		" @ @ @ @ @ @ @ @ @ @ @",
	]},



	{ title:"multiple bounces", board:[
	    "",
		"     @ @ @ @ @ X     ",
		"    @ . . . . . @    ",
		"   @ . . _ # . . @   ",
		"  @ . @ . _ . . . @  ",
		" @ . . . . . . @ . @ ",
		"@ . . 🡖 . . . . . . @",
		" @ . @ 🡖 . . . . . @ ",
		"  @ . . ⇨ ⇨ o # _ @  ",
		"   X . _ # . . _ @   ",
		"    @ . _ . . . @    ",
		"     @ @ @ @ @ @     "
	]},
	{ title:"end", picture:SPRITES.PICTURES.end},
];

LEVELS.forEach(function(level){
	if (level.picture) return;
	console.log(level.title);
	level.board = makeBoard(level.board);
});

function setBoard(newBoard) {
	board = cloneBoard(newBoard);
	undoStack = [];
}

let maxLevel = 0;
let currentLevel;

function setLevel(idx) {
	if (currentLevel !== idx) {
		if (history && history.replaceState) history.replaceState({},"","?" + idx);
	}
	currentLevel = idx;
	maxLevel = Math.max(maxLevel, currentLevel);
	if (LEVELS[currentLevel].picture) {
		picture = LEVELS[currentLevel].picture;
		board = null;
		isEnd = (LEVELS[currentLevel].isEnd ? true : false);
	} else {
		picture = null;
		setBoard(LEVELS[currentLevel].board);
		isEnd = false;
	}
}

if (document.location.search.match(/^\?\d+/)) {
	setLevel(parseInt(document.location.search.substr(1)));
} else {
	setLevel(0);
}

function next() {
	if (isWon() || currentLevel < maxLevel) {
		setLevel(currentLevel + 1);
	}
}

function prev() {
	if (currentLevel > 0) {
		setLevel(currentLevel - 1);
	}
}

function cloneBoard(b) {
	function cloneObjArray(arr) {
		let ret = [];
		arr.forEach(function(obj){
			let clone = {};
			for (var name in obj) {
				clone[name] = obj[name];
			}
			ret.push(clone);
		});
		return ret;
	}
	let clone = {
		size:{x:b.size.x, y:b.size.y},
		ground:b.ground,
		rockArea:b.rockArea,
		bounds:b.bounds,
		offset:b.offset,
		rocks:cloneObjArray(b.rocks),
		sables:cloneObjArray(b.sables),
		tween:1.0,
	};
	//clear controls:
	for (let rock of clone.rocks) {
		delete rock.shove;
	}
	for (let sable of clone.sables) {
		delete sable.held;
		delete sable.pulled;
	}
	setBehaviors(clone);
	return clone;
}


function makeBoard(map_) {
	//flip map_ over to save on indexing hassle:
	const map = [];
	for (let r = 0; r < map_.length; ++r) {
		map.unshift([]);
		let c = 0;
		for (let ch of map_[r]) {
			if (r % 2 === 0) {
				if (c % 2 === 0) {
					map[0].push(ch);
				} else {
					if (ch !== ' ') throw new Error(`Bad stagger in row ${r}: '${map_[r]}' (${c} is '${ch}')`);
				}
			} else {
				if (c % 2 === 0) {
					if (ch !== ' ') throw new Error(`Bad stagger in row ${r}: '${map_[r]}' (${c} is '${ch}')`);
				} else {
					map[0].push(ch);
				}
			}
			++c;
		}
	}
	//make sure first (last) row of map_ lands on even index:
	if (map.length % 2 === 0) map.unshift([]);

	function logMap() {
		let str = '';
		for (let row = map.length-1; row >= 0; --row) {
			if (row % 2 !== 0) str += ' ';
			for (let col = 0; col < map[row].length; ++col) {
				if (col !== 0) str += ' ';
				str += map[row][col];
			}
			str += '\n';
		}
		console.log(str);
	}
	logMap();

	let made = {};
	made.size = {x:0, y:map.length};
	for (let row of map) {
		made.size.x = Math.max(made.size.x, row.length);
	}

	//fix map to have uniform size rows:
	for (let row of map) {
		while (row.length < made.size.x) row.push(' ');
	}

	made.sables = [];

	function extractSable(map, sc, sr) {
		let at = {x:sc, y:sr};
		console.assert(map[at.y][at.x] === 'o');
		map[at.y][at.x] = '.'; //convert to ground
		const sable = {
			pts:[at],
			bodyLength:0,
			tailLength:0
			//remain: //count of segments that haven't left yet
		};
		//search for body:
		while (true) {
			let found = false;
			['⇦', '⬃', '⬂', '⇨', '⬀', '⬁'].forEach((ch, dir) => {
				let next = stepDir(at, dir);
				if (next.y >= 0 && next.y < map.length && next.x >= 0 && next.x < map[next.y].length) {
					if (map[next.y][next.x] === ch) {
						if (found) throw new Error("ambiguous sable");
						found = next;
					}
				}
			});
			if (!found) break;
			at = found;
			sable.pts.push({x:found.x, y:found.y});
			sable.bodyLength += 1;
			map[found.y][found.x] = '.';
		}
		if (sable.bodyLength === 0) throw new Error("degerate sable");
		//search for tail:
		while (true) {
			let found = false;
			['🡐', '🡗', '🡖', '🡒', '🡕', '🡔'].forEach((ch, dir) => {
				let next = stepDir(at, dir);
				if (next.y >= 0 && next.y < map.length && next.x >= 0 && next.x < map[next.y].length) {
					if (map[next.y][next.x] === ch) {
						if (found) throw new Error("ambiguous sable");
						found = next;
					}
				}
			});
			if (!found) break;
			at = found;
			sable.pts.push({x:found.x, y:found.y});
			sable.tailLength += 1;
			map[found.y][found.x] = '.';
		}

		made.sables.push(sable);
	}
	for (let sr = 0; sr < made.size.y; ++sr) {
		for (let sc = 0; sc < made.size.x; ++sc) {
			if (map[sr][sc] !== 'o') continue;
			//we have a sable head!
			extractSable(map, sc, sr);
		}
	}

	logMap();

	made.rocks = [];
	for (let r = 0; r < made.size.y; ++r) {
		for (let c = 0; c < made.size.x; ++c) {
			if (map[r][c] === '#') {
				//we have a rock:
				made.rocks.push({ x:c, y:r, sprite:SPRITES.rock });
				map[r][c] = '_';
			}
		}
	}

	made.rockArea = [];
	for (let r = 0; r < made.size.y; ++r) {
		let row = [];
		made.rockArea.push(row);
		for (let c = 0; c < made.size.x; ++c) {
			if (map[r][c] === '_') {
				row.push(true);
				map[r][c] = '.';
			} else {
				row.push(false);
			}
		}
	}
	logMap();

	made.ground = [];
	for (let row = 0; row < made.size.y; ++row) {
		let arr = [];
		made.ground.push(arr);
		for (let col = 0; col < made.size.x; ++col) {
			if (map[row][col] === '.') {
				arr.push(SPRITES.HEXES.dirt);
			} else if (map[row][col] === 'X') {
				arr.push(SPRITES.HEXES.exit);
			} else {
				arr.push(null);
			}
		}
	}

	made.offset = {x:0, y:0};
	made.bounds = {
		min:{x:Infinity, y:Infinity},
		max:{x:-Infinity, y:-Infinity}
	};
	for (let row = 0; row < made.size.y; ++row) {
		for (let col = 0; col < made.size.x; ++col) {
			if (made.ground[row][col] === null) continue;
			if (made.ground[row][col] === SPRITES.HEXES.exit) continue;
			let px = {
				x:(col + (row % 2 == 0 ? 0 : 0.5)) * HEX_WIDTH,
				y:row * HEX_HEIGHT
			};
			//hard coded additions to get things lined up just so:
			made.bounds.min.x = Math.min(made.bounds.min.x, px.x - 11);
			made.bounds.min.y = Math.min(made.bounds.min.y, px.y - 13);
			made.bounds.max.x = Math.max(made.bounds.max.x, px.x + 11);
			made.bounds.max.y = Math.max(made.bounds.max.y, px.y + 12);
		}
	}

	return made;
}

//direction from a to b in col,row space:
//  2 1
// 3 . 0
//  4 5
function getDir(a,b) {
	if (a.y === b.y) {
		if (a.x + 1 === b.x) return 0;
		if (a.x - 1 === b.x) return 3;
	} else if (a.y + 1 === b.y) {
		const d = (a.y % 2 === 0 ? -1 : 0);
		if (a.x + d + 1 === b.x) return 1;
		if (a.x + d === b.x) return 2;
	} else if (a.y - 1 === b.y) {
		const d = (a.y % 2 === 0 ? -1 : 0);
		if (a.x + d + 1 === b.x) return 5;
		if (a.x + d === b.x) return 4;
	}
	throw new Error(`Invalid direction ${a.x},${a.y} to ${b.x},${b.y}.`);
}
function stepDir(a, dir) {
	if (dir === 0) return {x:a.x+1, y:a.y};
	if (dir === 3) return {x:a.x-1, y:a.y};
	const d = (a.y % 2 === 0 ? -1 : 0);
	if (dir === 1) return {x:a.x+d+1, y:a.y+1};
	if (dir === 2) return {x:a.x+d, y:a.y+1};
	if (dir === 5) return {x:a.x+d+1, y:a.y-1};
	if (dir === 4) return {x:a.x+d, y:a.y-1};
	throw new Error(`Invalid step ${a.x},${a.y} to ${dir}.`);
}


function lerp(a,b,amt) {
	return {
		x:amt*(b.x-a.x)+a.x,
		y:amt*(b.y-a.y)+a.y
	};
}

function normalize(a) {
	let len = Math.sqrt(a.x**2 + a.y**2);
	if (len == 0.0) return {x:1.0, y:0.0};
	else return {x:a.x/len, y:a.y/len};
}


function pixelPos(col, row) {
	return {
		x:board.offset.x + (col + (row % 2 == 0 ? 0 : 0.5)) * HEX_WIDTH,
		y:board.offset.y + row * HEX_HEIGHT
	};
}

function setMouseHex() {
	delete mouse.hx;
	delete mouse.hy;
	if (board && mouse.x === mouse.x) {
		//there is a better way (and a more correct way), but for now:
		let best2 = Infinity;
		let minY = Math.floor((mouse.y - board.offset.y) / HEX_HEIGHT);
		let maxY = minY + 2;
		for (let y = minY; y <= maxY; ++y) {
			let minX = Math.floor((mouse.x - board.offset.x - (y % 2 == 0 ? 0.0 : 0.5) * HEX_WIDTH) / HEX_WIDTH);
			let maxX = minX + 2;
			for (let x = minX; x <= maxX; ++x) {
				let px = pixelPos(x,y);
				let len2 = (mouse.x-px.x)**2+(mouse.y-px.y)**2;
				if (len2 < best2) {
					mouse.hx = x;
					mouse.hy = y;
					best2 = len2;
				}
			}
		}
	}
}

let DEBUG_draw = true;

function draw() {
	ctx.setTransform(1,0, 0,-1, 0,canvas.height);
	ctx.globalAlpha = 1.0;

	ctx.fillStyle = '#000';
	ctx.fillRect(0,0, ctx.width,ctx.height);

	if (board) {
		board.offset = {
			x:Math.floor((ctx.width - (board.bounds.max.x + 1 - board.bounds.min.x))/2-board.bounds.min.x),
			y:Math.floor((ctx.height-10 - (board.bounds.max.y + 1 - board.bounds.min.y))/2-board.bounds.min.y + 10)
		};
		if (DEBUG_draw) console.log(`Offset of ${board.offset.x},${board.offset.y} in ctx of size ${ctx.width}x${ctx.height} for board of size ${board.bounds.max.x+1-board.bounds.min.x}x${board.bounds.max.y+1-board.bounds.min.y}`);
	}
	setMouseHex();

	function drawSprite(x,y,sprite) {
		let ox = -(sprite.ax - sprite.x);
		let oy = -(sprite.ay - sprite.y);
		ctx.save();
		ctx.setTransform(1,0, 0,1, x+ox, ctx.height-1-y+oy);
		ctx.drawImage(SPRITES_IMG, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);

		/*
		ctx.fillStyle = '#0ff';
		ctx.globalAlpha = 0.3;
		ctx.fillRect(0,0, sprite.w,sprite.h);
		ctx.globalAlpha = 1.0;

		ctx.fillStyle = '#ff0';
		ctx.fillRect(sprite.ax - sprite.x, sprite.ay-sprite.y, 1,1);
		*/

		ctx.restore();

		//ctx.fillStyle = '#f00';
		//ctx.fillRect(x,y,1,1);
	}

	if (picture) {
		drawSprite(0,0,picture);
	}

	function drawSpriteD(sprite, x,y, dx,dy, px,py) {
		if (typeof(px) === 'undefined') px = -dy;
		if (typeof(py) === 'undefined') py = dx;

		let ox = (sprite.ax + 0.5 - sprite.x);
		let oy = (sprite.ay + 0.5 - sprite.y);
		ctx.save();
		ctx.setTransform(dx,-dy, -px,py, x + 0.5 - (dx*ox-px*oy), ctx.height-1-y + 0.5 - (-dy*ox+py*oy) );
		ctx.drawImage(SPRITES_IMG, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);

		/*ctx.fillStyle = '#0ff';
		ctx.globalAlpha = 0.3;
		ctx.fillRect(0,0, sprite.w,sprite.h);
		ctx.globalAlpha = 1.0;

		ctx.fillStyle = '#f00';
		ctx.fillRect(sprite.ax - sprite.x, sprite.ay-sprite.y, 5,1);
		ctx.fillStyle = '#0f0';
		ctx.fillRect(sprite.ax - sprite.x, sprite.ay-sprite.y, 1,5);

		ctx.fillStyle = '#ff0';
		ctx.fillRect(sprite.ax - sprite.x, sprite.ay-sprite.y, 1,1);
		*/

		ctx.restore();

		//ctx.fillStyle = '#f00';
		//ctx.fillRect(x,y,1,1);
	}


	function drawAction(at, to) {
		const px = pixelPos(at.x, at.y);
		drawSprite(px.x, px.y, SPRITES.cursorGrab);
		if (to) {
			const toPx = pixelPos(to.x, to.y);
			const half = lerp(px, toPx, 0.7);
			const dir = getDir(at, to);
			if      (dir === 0) drawSpriteD(SPRITES.arrowHoriz, half.x,half.y, 1,0, 0,1);
			else if (dir === 1) drawSpriteD(SPRITES.arrowDiag, half.x,half.y, 1,0, 0,1);
			else if (dir === 2) drawSpriteD(SPRITES.arrowDiag, half.x,half.y, -1,0, 0,1);
			else if (dir === 3) drawSpriteD(SPRITES.arrowHoriz, half.x,half.y,-1,0, 0,1);
			else if (dir === 4) drawSpriteD(SPRITES.arrowDiag, half.x,half.y, -1,0, 0,-1);
			else if (dir === 5) drawSpriteD(SPRITES.arrowDiag, half.x,half.y, 1,0, 0,-1);
		}
	}


	//draw board:
	if (board) {
	
		//ground:
		for (let row = 0; row < board.size.y; ++row) {
			for (let col = 0; col < board.size.x; ++col) {
				if (board.ground[row][col] !== null) {
					let {x,y} = pixelPos(col, row);
					drawSprite(x,y, board.ground[row][col] );
				}
			}
		}
		//rock drag markers:
		for (let row = 0; row < board.size.y; ++row) {
			for (let col = 0; col < board.size.x; ++col) {
				if (!board.rockArea[row][col]) continue;
				let {x,y} = pixelPos(col, row);
				if (col > 0) {
					if (board.rockArea[row][col-1]) {
						drawSprite(x - 0.5 * HEX_WIDTH, y, SPRITES.rockHoriz);
					}
				}
				if (row + 1 < board.size.y) {
					const upLeft = stepDir({x:col, y:row}, 2);
					if (upLeft.x >= 0 && upLeft.x <= board.size.x && board.rockArea[upLeft.y][upLeft.x]) {
						const px = pixelPos(upLeft.x, upLeft.y);
						drawSpriteD(SPRITES.rockDiag, 0.5*(x+px.x),0.5*(y+px.y), -1,0, 0,1);
					}
					const upRight = stepDir({x:col, y:row}, 1);
					if (upRight.x >= 0 && upRight.x <= board.size.x && board.rockArea[upRight.y][upRight.x]) {
						const px = pixelPos(upRight.x, upRight.y);
						drawSprite(0.5*(x+px.x),0.5*(y+px.y), SPRITES.rockDiag);
					}
				}
				drawSprite(x, y, SPRITES.rockSpot);
			}
		}

		//shines:
		const exits = {}; //any exit which is shining will get drawn over!
		for (let row = 0; row < board.size.y; ++row) {
			for (let col = 0; col < board.size.x; ++col) {
				if (board.ground[row][col] === SPRITES.HEXES.exit) continue;
				if (board.ground[row][col] === null) continue;
				//only filled ground which isn't an exit
				for (let dir = 0; dir < 6; ++dir) {
					const n = stepDir({x:col, y:row}, dir);
					if (isExit(board,n.x, n.y)) {
						exits[`${n.x},${n.y}`] = n;
						let {x,y} = pixelPos(col, row);
						//draw shine!
						if      (dir == 0) drawSpriteD(SPRITES.shine, x,y, 1,0, 0,1);
						else if (dir == 1) drawSpriteD(SPRITES.shineDiag, x,y, 1,0, 0, 1);
						else if (dir == 2) drawSpriteD(SPRITES.shineDiag, x,y,-1,0, 0, 1);
						else if (dir == 3) drawSpriteD(SPRITES.shine, x,y,-1,0, 0,1);
						else if (dir == 4) drawSpriteD(SPRITES.shineDiag, x,y,-1,0, 0,-1);
						else if (dir == 5) drawSpriteD(SPRITES.shineDiag, x,y, 1,0, 0,-1);
					}
				}
			}
		}
	
		//helpful outlines:
		for (let row = 0; row < board.size.y; ++row) {
			for (let col = 0; col < board.size.x; ++col) {
				if (board.ground[row][col] === SPRITES.HEXES.exit) continue;
				if (board.ground[row][col] === null) continue;
				let {x,y} = pixelPos(col, row);
				drawSprite(x,y, SPRITES.HEXES.outline);
			}
		}

		//rocks:
		for (let rock of board.rocks) {
			const px = pixelPos(rock.x, rock.y);
			drawSprite(px.x, px.y, rock.sprite);
		}

		let layerOutline = [];
		let layerLegs = [];
		let layerConnect = [];
		let layerBody = [];
		let layerHead = [];

		//sables:
		let sableIndex = -1;
		for (let sable of board.sables) {
			sableIndex += 1;
			if (sable.remain === 0) continue; //don't draw if entirely gone

			//TODO: do drawing loop in one pass and handle animation (and extra neck) into the mix because, um, why not?

		
			function addSprite(layer, sprite, at, A, S, dx, dy) {
				if (A === 0.0) return;

				if (typeof(S) === 'undefined') S = 1.0;
				if (typeof(dx) === 'undefined') dx = {x:1, y:0};
				if (typeof(dy) === 'undefined') dy = {x:-dx.y, y:dx.x};
				layer.push({sprite, x:at.x, y:at.y, A, S, dx, dy});

				if (layer !== layerOutline && sprite.outline) {
					addSprite(layerOutline, sprite.outline, at, A, S, dx, dy);
				}
			}

			function drawLegs(at, A, S, d, Y) {
				if (A === 0.0) return;
				let ox = -d.y;
				let oy = d.x;
				const HX = 0;
				const HY = 5 + Y;
				addSprite(layerLegs, SPRITES.leg, {x:at.x + ox*HY + d.x*HX, y:at.y + oy*HY + d.y*HX}, A, 1.0, d);
				addSprite(layerLegs, SPRITES.leg, {x:at.x + ox*-HY + d.x*HX, y:at.y + oy*-HY + d.y*HX}, A, 1.0, d, {x:d.y, y:-d.x});
				const PX = 7;
				const PY = 7 + Y;
				addSprite(layerLegs, SPRITES.paw, {x:at.x + ox*PY + d.x*PX, y:at.y + oy*PY + d.y*PX}, A, 1.0, d);
				addSprite(layerLegs, SPRITES.paw, {x:at.x + ox*-PY + d.x*PX, y:at.y + oy*-PY + d.y*PX}, A, 1.0, d,  {x:d.y, y:-d.x});
			}
		
			for (let i = 0; i < sable.pts.length; ++i) {
				const at = pixelPos(sable.pts[i].x, sable.pts[i].y);
				const A = (sable.pts[i].exited ? 0.0 : 1.0);
				if (i === 0) {
					let n;
					if (sable.next) {
						n = pixelPos(sable.next.x, sable.next.y);
					} else {
						n = pixelPos(sable.pts[i+1].x, sable.pts[i+1].y);
						n.x = at.x + (at.x - n.x);
						n.y = at.y + (at.y - n.y);
					}
					let dx = normalize({
						x:n.x - at.x,
						y:n.y - at.y
					});


					if (sable.barking && sable.next) {
						let amt = loop * sable.barking.of - sable.barking.i;
						if (amt > 0.0 && amt < 0.9) {
							addSprite(layerBody, SPRITES.bark, n, 1.0); // '!' effect
							addSprite(layerHead, SPRITES.headBark, at, A, 1.0, dx);

							//extra neck:
							const prev = pixelPos(sable.pts[i+1].x, sable.pts[i+1].y);
							const mid = lerp(at, prev, 0.5);
							addSprite(layerConnect, SPRITES.body, lerp(mid, at, 0.7), A, 0.7, dx);
						} else {
							addSprite(layerHead, SPRITES.head, at, A, 1.0, dx);
						}
					} else if (sable.biting && sable.next) {
						const h = lerp(at, n, 0.7);
						addSprite(layerHead, SPRITES.headBite, h, A, 1.0, dx);
						addSprite(layerConnect, SPRITES.headJaw, h, A, 1.0, dx);

						//extra neck:
						const prev = pixelPos(sable.pts[i+1].x, sable.pts[i+1].y);
						const mid = lerp(at, prev, 0.5);
						const d2 = normalize({
							x:h.x - mid.x,
							y:h.y - mid.y
						});
						addSprite(layerConnect, SPRITES.body, lerp(mid, at, 0.7), A, 0.7, d2);
					} else {
						addSprite(layerHead, SPRITES.head, at, A, 1.0, dx);
					}
				} else if (i <= sable.bodyLength) {
					const b = i - 1; //index in body

					const n = pixelPos(sable.pts[i-1].x, sable.pts[i-1].y);

					let S = Math.sin(breathe * Math.PI * 2.0 + sableIndex) * 0.05 + 0.92;
					S = ((b + 1.0) / sable.bodyLength) * (1.0 - S) + S;

					{ //neck/body connector:
						const d2 = normalize({
							x:n.x - at.x,
							y:n.y - at.y
						});
						addSprite(layerConnect, SPRITES.body, lerp(at, n, 0.5), A, (b === 0 ? 0.7 : S), d2);

						if (b === 0) {
							drawLegs(lerp(at,n,0.5), A, 0.7, d2, 0);
						}
					}

					let d;
					if (i + 1 < sable.pts.length) {
						const p = pixelPos(sable.pts[i+1].x, sable.pts[i+1].y);
						d = normalize({
							x:n.x - p.x,
							y:n.y - p.y
						});
					} else {
						d = normalize({
							x:n.x - at.x,
							y:n.y - at.y
						});
					}

					addSprite(layerBody, SPRITES.body, at, A, S, d);

					if (b + 1 === sable.bodyLength) {
						drawLegs(at, A, 1.0, d, 2);
					}
				} else {
					const t = i - 1 - sable.bodyLength; //index in tail

					const n = pixelPos(sable.pts[i-1].x, sable.pts[i-1].y);

					{ //neck/body connector:
						const d2 = normalize({
							x:n.x - at.x,
							y:n.y - at.y
						});
						addSprite(layerConnect, SPRITES.tail, lerp(at, n, 0.5), A, (t === 0 ? 0.7 : 1.0), d2);
					}

					let d;
					if (i + 1 < sable.pts.length) {
						const p = pixelPos(sable.pts[i+1].x, sable.pts[i+1].y);
						d = normalize({
							x:n.x - p.x,
							y:n.y - p.y
						});
					} else {
						d = normalize({
							x:n.x - at.x,
							y:n.y - at.y
						});
					}

					addSprite(layerBody, SPRITES.tail, at, A, 1.0, d);


				}
			}

			/*OLD:
			for (let i = 0; i < pts.length; ++i) {
				if (i == 0) {
					if (sable.next) {
						const n = pixelPos(sable.next.x, sable.next.y);
						pts[i].d = normalize({
							x:n.x - pts[i].x,
							y:n.y - pts[i].y
						});
					} else {
						pts[i].d = normalize({
							x:pts[i].x - pts[i+1].x,
							y:pts[i].y - pts[i+1].y
						});
					}
				} else if (i + 1 == pts.length) {
					pts[i].d = normalize({
						x:pts[i-1].x - pts[i].x,
						y:pts[i-1].y - pts[i].y
					});
				} else {
					pts[i].d = normalize({
						x:pts[i-1].x - pts[i+1].x,
						y:pts[i-1].y - pts[i+1].y
					});
				}
			}

			function drawLegs(pt, Y) {
				if (pt.A === 0.0) return;
				ctx.globalAlpha = pt.A;

				let ox = -pt.d.y;
				let oy = pt.d.x;
				const HX = 0;
				const HY = 5 + Y;
				drawSpriteD(SPRITES.leg, pt.x + ox*HY + pt.d.x*HX, pt.y + oy*HY + pt.d.y*HX, pt.d.x, pt.d.y);
				drawSpriteD(SPRITES.leg, pt.x + ox*-HY + pt.d.x*HX, pt.y + oy*-HY + pt.d.y*HX, pt.d.x, pt.d.y,  pt.d.y, -pt.d.x);
				const PX = 7;
				const PY = 7 + Y;
				drawSpriteD(SPRITES.paw, pt.x + ox*PY + pt.d.x*PX, pt.y + oy*PY + pt.d.y*PX, pt.d.x, pt.d.y);
				drawSpriteD(SPRITES.paw, pt.x + ox*-PY + pt.d.x*PX, pt.y + oy*-PY + pt.d.y*PX, pt.d.x, pt.d.y,  pt.d.y, -pt.d.x);
			}
		
			pts.forEach((pt,i) => {
				if (pt.sprite.outline) {
					ctx.globalAlpha = pt.A;
					drawSpriteD(pt.sprite.outline, pt.x, pt.y, pt.S * pt.d.x, pt.S * pt.d.y);
				}
			});

			drawLegs(pts[1], 0);
			drawLegs(pts[sable.bodyLength*2], 1);

			for (let i = 1; i < pts.length; i += 2) {
				if (pts[i].A === 0.0) continue;
				ctx.globalAlpha = pts[i].A;
				drawSpriteD(pts[i].sprite, pts[i].x, pts[i].y, pts[i].S * pts[i].d.x, pts[i].S * pts[i].d.y);
			}
			for (let i = pts.length-1; i >= 0; i -= 2) {
				if (pts[i].A === 0.0) continue;
				ctx.globalAlpha = pts[i].A;
				drawSpriteD(pts[i].sprite, pts[i].x, pts[i].y, pts[i].S * pts[i].d.x, pts[i].S * pts[i].d.y);
			}
			ctx.globalAlpha = 1.0;
			/*
			pts.forEach((pt, idx) => {
				if (idx === 0) return;
				drawSpriteD(pt.sprite, pt.x, pt.y, pt.S * pt.d.x, pt.S * pt.d.y);
			});
			*/

		}

		
		function drawLayer(layer) {
			for (let pt of layer) {
				ctx.globalAlpha = pt.A;
				drawSpriteD(pt.sprite, pt.x, pt.y,
					pt.S * pt.dx.x, pt.S * pt.dx.y,
					pt.S * pt.dy.x, pt.S * pt.dy.y
				);
			}
		}
		[ layerOutline, layerLegs, layerConnect, layerBody, layerHead ].forEach( drawLayer );


		//draw exits over sables:
		for (let key of Object.values(exits)) {
			let {x,y} = pixelPos(key.x, key.y);
			drawSprite(x, y, SPRITES.HEXES.exit);
		}

		//draw actions:
		if (mouse.action) {
			if (mouse.action.shoved) {
				drawAction(mouse.action.shoved, mouse.action.shoved.shoved);
			}
			if (mouse.action.pulled) {
				drawAction(mouse.action, mouse.action.to);
			}
			if (mouse.action.held) {
				drawAction(mouse.action);
			}
		}

	}

	/*//DEBUG: draw bounds:
	if (board) {
		ctx.setTransform(1,0, 0,-1, 0,canvas.height);
		ctx.fillStyle = '#f33';
		ctx.fillRect(
			board.offset.x+board.bounds.min.x,
			board.offset.y+board.bounds.min.y,
			(board.bounds.max.x+1 - board.bounds.min.x),
			(board.bounds.max.y+1 - board.bounds.min.y)
		);
	}*/

	/*
	//clear buttons list
	buttons = {};
	function drawButton(name, x, y) {
		ctx.globalAlpha = (name in mouse.over ? 1.0 : 0.5);
		drawButton(x, y, SPRITES.BUTTONS.prev);
		buttons.name = {x,y};
	}*/

	//draw UI:
	if (board) {
		ctx.globalAlpha = (mouse.overReset ? 1.0 : 0.5);
		drawSprite(0, 0, SPRITES.BUTTONS.reset);

		ctx.globalAlpha = (mouse.overStep ? 1.0 : 0.5);
		drawSprite(Math.floor(ctx.width/2), 0, SPRITES.BUTTONS.step);

		ctx.globalAlpha = (mouse.overUndo ? 1.0 : 0.5);
		drawSprite(ctx.width-1, 0, SPRITES.BUTTONS.undo);
	}
	if (currentLevel > 0) {
		ctx.globalAlpha = (mouse.overPrev ? 1.0 : 0.5);
		drawSprite(0, ctx.height-1, SPRITES.BUTTONS.prev);
	}
	if (currentLevel + 1 < LEVELS.length && (currentLevel < maxLevel || isWon())) {
		ctx.globalAlpha = (mouse.overNext ? 1.0 : 0.5);
		drawSprite(ctx.width-1, ctx.height-1, SPRITES.BUTTONS.next);
	}

	ctx.globalAlpha = 1.0;


	//draw mouse:
	if (mouse.action) {
		//hand drawn on action
	} else if (mouse.overPrev || mouse.overNext || mouse.overUndo || mouse.overStep || mouse.overReset) {
		//no big hand
		//drawSprite(mouse.x, mouse.y, SPRITES.cursorClick);
	} else if (mouse.x === mouse.x) {
		if (board && mouse.hx >= 0 && mouse.hx < board.size.x && mouse.hy >= 0 && mouse.hy < board.size.y && board.actions[mouse.hy][mouse.hx].length) {
			ctx.globalAlpha = 0.8 + Math.sin(loop * 2.0 * Math.PI * 2.0) * 0.1;
			drawAction({x:mouse.hx, y:mouse.hy});
			ctx.globalAlpha = 1.0;
		} else {
			drawSprite(mouse.x, mouse.y, SPRITES.cursor);
		}
	}
	//draw mouse (DEBUG):
	if (mouse.x === mouse.x) {
		ctx.fillStyle = "#fff";
		ctx.fillRect(mouse.x - 1, mouse.y, 3, 1);
		ctx.fillRect(mouse.x, mouse.y - 1, 1, 3);
		ctx.fillStyle = "#000";
		ctx.fillRect(mouse.x, mouse.y, 1, 1);
	}

	/*if ('hx' in mouse) {
		let at = pixelPos(mouse.hx, mouse.hy);
		drawSprite(at.x, at.y, SPRITES.HEXES.grass);
	}*/

	DEBUG_draw = false;
}

function update(elapsed) {
	//NOTE: should probably compute whether drawing is needed to save cpu.
	if (board) {
		if (board.tween < 1.0) {
			board.tween = Math.min(1.0, board.tween + elapsed);
		}
	}
	//basic animation loop:
	loop += elapsed;
	loop -= Math.floor(loop);
	//breathing animation loop:
	breathe += elapsed / 2.0;
	breathe -= Math.floor(breathe);
}

//step board forward given current selected action:
//board motions happen in three (possibly empty) phases:
//(1) rocks get shoved (into rockarea without other rocks or sables)
//(2) sables get pulled (straight back, into floor area without rocks or sables)
//   (bulled sables become held)
//(3) sables determine facing direction
//  (3a) non-held sables facing the same cell bark
//  (3b) non-held, non-barking sables facing a tail bite
//  (3c) non-held, non-barking, non-biting, non-bitten sables step
function stepBoard(board) {
	//remove any old animation:
	for (let rock of board.rocks) {
		delete rock.from;
	}
	for (let sable of board.sables) {
		delete sable.from;
	}

	//remove any old actions:
	delete mouse.action;

	{ //(1) rocks get shoved:
		//note open tiles (for rocks):
		let open = {};
		for (let y = 0; y < board.size.y; ++y) {
			for (let x = 0; x < board.size.x; ++x) {
				if (board.rockArea[y][x]) {
					open[`${x},${y}`] = true;
				}
			}
		}

		//tiles containing rocks are not open:
		for (let rock of board.rocks) {
			delete open[`${rock.x},${rock.y}`];
		}

		//remove open for sable bodies / heads (tail is "open" but really just results in bites):
		for (let sable of board.sables) {
			for (let pt of sable.pts) {
				if (pt.exited) {
					//exited points are ~insubstantial~
				} else {
					delete open[`${pt.x},${pt.y}`];
				}
			}
		}

		for (let rock of board.rocks) {
			if (!('shoved' in rock)) continue;
			const key = `${rock.shoved.x},${rock.shoved.y}`;
			if (key in open) {
				//NOTE: assuming only one action(!)
				open[`${rock.x},${rock.y}`] = true;
				rock.from = {x:rock.x, y:rock.y};
				rock.x = rock.shoved.x;
				rock.y = rock.shoved.y;
				delete open[key];
			} else {
				console.log("Invalid shove?!");
			}
			delete rock.shoved; //remove old action
		}
	}

	{ //(2) sables get pulled:
		setBehaviors(board);
		for (let sable of board.sables) {
			//if sable is getting pulled, and spot behind is open, do the work
			if (!('pulled' in sable)) continue;

			if (!('prev' in sable)) {
				console.log("Can't pull if no prev!");
				continue;
			}

			//remember pose for animation:
			sable.from = sable.pts;

			//insert prev point and back up pts: (note this also shifts off exit flags)
			sable.pts = sable.pts.slice();
			sable.pts.shift();
			sable.pts.push(sable.prev);
			//NOTE: if trying to resolve multiple pulls, this isn't going to quite work right.
		}
	}


	{ //(3) sables bark, bite, or step:
		setBehaviors(board);

		//anything that isn't barking, biting, just got pulled, or is held go to next:
		for (let sable of board.sables) {
			if (!('next' in sable)) continue; //no step if no next
			if (sable.bitten || sable.biting || sable.barking) continue; //no step if fussing at others
			if (sable.held || sable.pulled) continue; //no step if got held or pulled

			sable.from = sable.pts;
			sable.pts = sable.pts.slice();
			sable.pts.pop();
			sable.pts.unshift({x:sable.next.x, y:sable.next.y});
			if (sable.pts[1].exited) sable.pts[0].exited = true; //copy exited tag forward
			for (let i = 0; i < sable.pts.length; ++i) {
				if (isExit(board,sable.pts[i].x, sable.pts[i].y)) {
					if (!sable.pts[i].exited) {
						sable.pts[i] = {
							x:sable.pts[i].x,
							y:sable.pts[i].y,
							exited:true
						};
					}
				}
			}
		}
	}

	//clear all actions:
	for (let sable of board.sables) {
		delete sable.held;
		delete sable.pulled;
	}
	setBehaviors(board);
}

function isExit(board, col, row) {
	if (col < 0 || col >= board.size.x || row < 0 || row >= board.size.y) return true;
	return board.ground[row][col] === SPRITES.HEXES.exit;
}

//compute 'next', 'prev', 'biting', 'bitten', 'barking' for sables
// (given current hold, pull actions and rock positions)
function setBehaviors(board) {

	//clear existing actions lists:
	board.actions = [];
	for (let row = 0; row < board.size.y; ++row) {
		const arr = [];
		board.actions.push(arr);
		for (let col = 0; col < board.size.x; ++col) {
			arr.push([]);
		}
	}

	//clear existing behaviors:
	for (let sable of board.sables) {
		delete sable.next; //where it would step if it could
		delete sable.prev; //where it would get pulled if it could
		delete sable.barking; //is it barking? value is object like {i:1, of:2}
		delete sable.biting; //is it biting? value is true
		delete sable.bitten; //value is list of biters (so can check self-bite for pull)
	}

	{ //set shoves for rocks:
		//note open tiles (for rocks):
		let open = {};
		for (let y = 0; y < board.size.y; ++y) {
			for (let x = 0; x < board.size.x; ++x) {
				if (board.rockArea[y][x]) {
					open[`${x},${y}`] = true;
				}
			}
		}

		//tiles containing rocks are not open:
		for (let rock of board.rocks) {
			delete open[`${rock.x},${rock.y}`];
		}

		//remove open for sable bodies / heads (tail is "open" but really just results in bites):
		for (let sable of board.sables) {
			for (let pt of sable.pts) {
				if (pt.exited) {
					//exited points are ~insubstantial~
				} else {
					delete open[`${pt.x},${pt.y}`];
				}
			}
		}

		for (let rock of board.rocks) {
			for (let dir = 0; dir < 6; ++dir) {
				let n = stepDir(rock, dir);
				if (`${n.x},${n.y}` in open) {
					board.actions[rock.y][rock.x].push({
						shove:{x:n.x, y:n.y},
						shoved:rock,
						index:board.actions[rock.y][rock.x].length
					});
				}
			}
		}
	}

	{ //set 'prev':
		//note open tiles (for pulls):
		let open = {};
		//must be a ground tile and *not* an exit:
		for (let y = 0; y < board.size.y; ++y) {
			for (let x = 0; x < board.size.x; ++x) {
				if (board.ground[y][x] !== null && !isExit(board,x,y)) {
					open[`${x},${y}`] = true;
				}
			}
		}

		//can't contain a rock:
		for (let rock of board.rocks) {
			delete open[`${rock.x},${rock.y}`];
		}

		//remove open for any sable parts:
		for (let sable of board.sables) {
			for (let pt of sable.pts) {
				if (pt.exited) {
					//exited points are ~insubstantial~
				} else {
					delete open[`${pt.x},${pt.y}`];
				}
			}
		}

		for (let sable of board.sables) {
			//must have some non-exited parts:
			if (sable.pts[sable.pts.length-1].exited) continue;
			//must have a tail to pull:
			if (sable.tailLength === 0) continue;

			const dir = getDir(sable.pts[sable.pts.length-2], sable.pts[sable.pts.length-1]);
			const prev = stepDir(sable.pts[sable.pts.length-1], dir);

			if (`${prev.x},${prev.y}` in open) {
				sable.prev = prev;
			}
		}
	}


	{ //set 'next' and barking/biting/bitten:
		//note open tiles (for stepping/barking/biting):
		let open = {};
		//also note tails (for biting):
		let tails = {};
		//must be a ground tile or an exit:
		for (let y = 0; y < board.size.y; ++y) {
			for (let x = 0; x < board.size.x; ++x) {
				if (board.ground[y][x] !== null) {
					open[`${x},${y}`] = true;
				}
			}
		}

		//can't contain a rock:
		for (let rock of board.rocks) {
			delete open[`${rock.x},${rock.y}`];
		}

		//can't be a sable body or head:
		for (let sable of board.sables) {
			for (let i = 0; i < sable.pts.length; ++i) {
				const pt = sable.pts[i];
				const key = `${pt.x},${pt.y}`;
				if (pt.exited) {
					//exited points are ~insubstantial~
				} else if (i < 1 + sable.bodyLength) {
					//head / body are not open:
					delete open[key];
				} else {
					//tail is 'open' but note it:
					if (key in tails) {
						console.log("Tail overlap?!");
					}
					tails[key] = sable;
				}
			}
		}

		//exits are always open:
		for (let y = -1; y <= board.size.y; ++y) {
			for (let x = -1; x <= board.size.x; ++x) {
				if (isExit(board,x,y)) {
					open[`${x},${y}`] = true;
				}
			}
		}

		//set stable facing based on what tiles are open:
		//  - if there is a straight, set to straight
		//  - else, if there is a short left, set to short left
		//  - else, if there is a long left, set to long left
		//  - else, if there is a short right, set to short right
		//  - else, if there is a long right, set to long right
		// i.e.:
		//    . 2 1
		//   * - o 0
		//    . 4 3
		for (let sable of board.sables) {
			//fully exited sables don't move:
			if (sable.pts[sable.pts.length-1].exited) {
				continue;
			}

			const dir = getDir(sable.pts[1], sable.pts[0]);
			if (sable.pts[0].exited) {
				//exited sables continue straight, always:
				sable.next = stepDir(sable.pts[0], dir);
			} else {
				//non-exited sables turn head to left then right to find empty space:
				[0,1,2,5,4].some((ofs) => {
					const next = stepDir(sable.pts[0], (dir+ofs)%6);
					if (`${next.x},${next.y}` in open) {
						sable.next = next;
						return true;
					} else {
						return false;
					}
				});
			}
		}

		//check for bites and barks:
		let nexts = {};
		for (let sable of board.sables) {
			//TODO: is ignoring held/pulled the right thing to do?
			if (sable.held || sable.pulled) continue; //no bark or bite if held or pulled
			if (!('next' in sable)) continue; //no bite if no facing
			if (sable.pts[0].exited) continue; //no bite if head has exited
			if (isExit(board,sable.next.x, sable.next.y)) continue; //no bite at exit
			const key = `${sable.next.x},${sable.next.y}`;
			if (key in tails) {
				const target = tails[key];
				if (!('bitten' in target)) target.bitten = [];
				target.bitten.push(sable);
				sable.biting = true;
			} else {
				//only bark if not biting:
				if (!(key in nexts)) nexts[key] = [];
				nexts[key].push(sable);
			}
		}

		//check for + resolve barks:
		for (let key in nexts) {
			const list = nexts[key];
			if (list.length <= 1) continue;
			let i = 0;
			for (let sable of list) {
				sable.barking = {i:i, of:list.length};
				++i;
			}
		}
	} //end of set next/barking/biting/bitten

	for (let sable of board.sables) {
		//mark tail for grabs:
		for (let i = 1 + sable.bodyLength; i < sable.pts.length; ++i) {
			const pt = sable.pts[i];
			if (pt.exited) continue;
			if (sable.prev && !sable.bitten) {
				const to = (i + 1 < sable.pts.length ? sable.pts[i+1] : sable.prev);
				board.actions[pt.y][pt.x].push({ pulled:sable, to:{x:to.x, y:to.y} });
			} else {
				board.actions[pt.y][pt.x].push({ held:sable });
			}
		}
	}
}

function isWon() {
	if (board) {
		for (let sable of board.sables) {
			for (let pt of sable.pts) {
				if (!pt.exited) return false;
			}
		}
	}
	return true;
}

function execute() {
	undoStack.push(cloneBoard(board));
	stepBoard(board);
}
function undo() {
	if (undoStack.length) {
		board = undoStack.pop();
	}
	delete mouse.action;
	setBehaviors(board);
}
function reset() {
	if (undoStack.length) {
		undoStack.push(cloneBoard(board));
		board = cloneBoard(undoStack[0]);
	}
	delete mouse.action;
	setBehaviors(board);
}



function setup() {
	let canvas = document.getElementById("canvas");
	ctx = canvas.getContext('2d');
	ctx.width = canvas.width;
	ctx.height = canvas.height;
	ctx.imageSmoothingEnabled = false;

	//------------

	function setMouse(evt) {
		var rect = canvas.getBoundingClientRect();
		mouse.x = Math.floor( (evt.clientX - rect.left) / rect.width * ctx.width );
		mouse.y = Math.floor( (evt.clientY - rect.bottom) / -rect.height * ctx.height );

		function inRect(x,y,w,h) {
			return (mouse.x >= x && mouse.x < x+w && mouse.y >= y && mouse.y < y+h);
		}
		function inSprite(x,y,sprite) {
			return inRect( x + sprite.x - sprite.ax, y + -( (sprite.y + sprite.h) - sprite.ay ), sprite.w, sprite.h );
		}

		if (board) {
			mouse.overReset = inSprite(0,0,SPRITES.BUTTONS.reset);
			mouse.overStep = inSprite(Math.floor(ctx.width/2),0,SPRITES.BUTTONS.step);
			mouse.overUndo = inSprite(ctx.width,0,SPRITES.BUTTONS.undo);
		} else {
			mouse.overReset = false;
			mouse.overStep = false;
			mouse.overUndo = false;
		}
		mouse.overPrev = inSprite(0,ctx.height-1,SPRITES.BUTTONS.prev);
		mouse.overNext = inSprite(ctx.width,ctx.height,SPRITES.BUTTONS.next);
		/*let resetX = isEnd ? Math.floor((ctx.width - SPRITES.reset.width) / 2) : 1;
		mouse.overReset = (board || isEnd ? inRect(resetX,1,SPRITES.reset.width,SPRITES.reset.height) : false);
		mouse.overUndo = (board ? inRect(ctx.width-1-SPRITES.undo.width,1,SPRITES.undo.width,SPRITES.undo.height) : false);

		let y = (picture ? 1 : 10);
		mouse.overNext = (isWon() ? inRect(Math.floor((ctx.width-SPRITES.next.width)/2),y,SPRITES.next.width, SPRITES.next.height) : false);
		*/

		if (mouse.rock) {
			setMouseHex();
			for (let dir = 0; dir < 6; ++dir) {
				const n = stepDir({x:mouse.rock.x,y:mouse.rock.y}, dir);
				if (n.x === mouse.hx && n.y == mouse.hy) {
					if (n.x >= 0 && n.x < board.size.x && n.y >= 0 && n.y < board.size.y && board.rockArea[n.y][n.x]) {
						//move rock...
						//TODO: MANY things to consider (is it clear?)
						mouse.rock.x = n.x;
						mouse.rock.y = n.y;
					}
				}
			}
		}
	}

	function handleDown() {
		if (mouse.overPrev) {
			prev();
			return;
		} else if (mouse.overNext) {
			next();
			return;
		} else if (mouse.overUndo) {
			undo();
			return;
		} else if (mouse.overReset) {
			reset();
			return;
		} else if (mouse.overStep) {
			execute();
			return;
		}
		let oldAction = null;
		if (mouse.action) {
			oldAction = mouse.action;
			if (mouse.action.held) {
				delete mouse.action.held.held;
			}
			if (mouse.action.pulled) {
				delete mouse.action.pulled.pulled;
			}
			if (mouse.action.shoved) {
				delete mouse.action.shoved.shoved;
			}
			delete mouse.action;
			setBehaviors(board); //update barking/biting for held/pulled
		}
		if (board) {
			setMouseHex();
			if ('hx' in mouse && 'actions' in board) {
				if (0 <= mouse.hx && mouse.hx < board.size.x && 0 <= mouse.hy && mouse.hy < board.size.y) {
					const list = board.actions[mouse.hy][mouse.hx];
					if (list.length) {
						let index = 0;
						if (oldAction && oldAction.x === mouse.hx && oldAction.y === mouse.hy) {
							index = oldAction.index + 1;
						}
						if (index < list.length) {
							mouse.action = list[index];
							mouse.action.index = index;
							mouse.action.x = mouse.hx;
							mouse.action.y = mouse.hy;
						}
					}
					if (mouse.action) {
						if (mouse.action.held) {
							mouse.action.held.held = true;
						}
						if (mouse.action.pulled) {
							mouse.action.pulled.pulled = true;
						}
						if (mouse.action.shoved) {
							mouse.action.shoved.shoved = {x:mouse.action.shove.x, y:mouse.action.shove.y};
						}
						setBehaviors(board); //update barking/biting for held/pulled
					}
				}
			}
		}
	}

	function handleUp() {
	}

	canvas.addEventListener('touchstart', function(evt){
		evt.preventDefault();
		setMouse(evt.touches[0]);
		handleDown(evt.touches[0]);
		return false;
	});
	canvas.addEventListener('touchmove', function(evt){
		evt.preventDefault();
		setMouse(evt.touches[0]);
		return false;
	});
	canvas.addEventListener('touchend', function(evt){
		handleUp();
		mouse.x = NaN;
		mouse.y = NaN;
		return false;
	});

	window.addEventListener('mousemove', function(evt){
		evt.preventDefault();
		setMouse(evt);
		return false;
	});
	window.addEventListener('mousedown', function(evt){
		evt.preventDefault();
		setMouse(evt);
		handleDown(evt);
		return false;
	});

	window.addEventListener('mouseup', function(evt){
		evt.preventDefault();
		setMouse(evt);
		handleUp();
		return false;
	});

	
	//based on 'keydown' from TCHOW Pushgrid:
	window.addEventListener('keydown', function(evt){
		if (!evt.repeat) {
			if (evt.code === 'Space') {
				execute();
			} else if (evt.code === 'KeyZ') {
				undo();
			} else if (evt.code === 'KeyX') {
				reset();
			}
		}
	});


	//------------

	function resized() {
		let game = document.getElementById("game");
		let style = getComputedStyle(game);
		let size = {x:game.clientWidth, y:game.clientHeight};
		size.x -= parseInt(style.getPropertyValue("padding-left")) + parseInt(style.getPropertyValue("padding-right"));
		size.y -= parseInt(style.getPropertyValue("padding-top")) + parseInt(style.getPropertyValue("padding-bottom"));

		let mul = Math.max(1, Math.min(Math.floor(size.x / canvas.width), Math.floor(size.y / canvas.height)));
		size.x = mul * canvas.width;
		size.y = mul * canvas.height;

		canvas.style.width = size.x + "px";
		canvas.style.height = size.y + "px";
	}

	window.addEventListener('resize', resized);
	resized();

	const requestAnimFrame =
		window.requestAnimationFrame
		|| window.webkitRequestAnimationFrame
		|| window.mozRequestAnimationFrame
		|| window.oRequestAnimationFrame
		|| window.msRequestAnimationFrame
	;

	if (!requestAnimFrame) {
		alert("browser does not appear to support requestAnimationFrame");
		return;
	}

	var previous = NaN;
	var acc = 0.0;
	function animate(timestamp) {
		if (isNaN(previous)) {
			previous = timestamp;
		}
		var elapsed = (timestamp - previous) / 1000.0;
		previous = timestamp;

		//Run update (variable timestep):
		update(elapsed);

		//Draw:
		draw();

		requestAnimFrame(animate);
	}

	requestAnimFrame(animate);
}
