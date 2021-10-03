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
			//pull:{x,y} (new pts[pts.length-1])
			//hold:{x,y} (trying to step to location; doesn't move)

			//next actions might include:
			//next:{x,y} (new pts[0])
			//prev:{x,y} (new pts[pts.length-1])
			//barking:true //barking at 'next'
			//biting:true //biting a tail at 'next'
			//bitten:true //some sable is biting this one
		},
	],
	//for drawing:
	tween:1.0, //how far from [from .. pts] to draw sables
};

let picture = null;
let isEnd = false;

let undoStack = [];

//Body: ['⇦', '⬃', '⬂', '⇨', '⬀', '⬁']
//Tail: ['🡐', '🡗', '🡖', '🡒', '🡕', '🡔']

const LEVELS = [
	{ title:"test", board:[
		"@ @ 🡗 @ @ _ @",
		" . ⇨ ⇨ o # _ X X X X X X",
		"@ @ @ @ @ @ @",
	]},
	{ title:"sable turn left", board:[
		"    X . . . . . X X X",
		"   X . . # @ . . X X ",
		"  X . @ . _ . . . X X",
		" X . . . . . . @ . X ",
		"X . . 🡖 . . . . . . X",
		" X . @ 🡖 . . . . . X ",
		"  X . . ⇨ ⇨ o @ . X X",
		"   X . . @ . . . X X ",
		"    X . . . . . X X X",
	]},
];

board = makeBoard(LEVELS[1].board);

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


/*
LEVELS.forEach(function(level){
	if (level.picture) return;
	console.log(level.title);
	level.board = makeBoard(level.board, level.layers, level.library);
});
*/

/*
function setBoard(newBoard) {
	board = cloneBoard(newBoard);
	undoStack = [];
}
*/

/*
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
	if (isWon()) {
		setLevel(currentLevel + 1);
		if (currentLevel + 1 === LEVELS.length) {
			AUDIO.winGame.oneshot();
		} else {
			AUDIO.click.oneshot();
		}
	}
}
*/

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
			y:Math.floor((ctx.height - (board.bounds.max.y + 1 - board.bounds.min.y))/2-board.bounds.min.y)
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
						if (DEBUG_draw) console.log("--> ", px);
						drawSprite(0.5*(x+px.x),0.5*(y+px.y), SPRITES.rockDiag);
					}
				}
				drawSprite(x, y, SPRITES.rockSpot);
			}
		}

		//shines:
		for (let row = 0; row < board.size.y; ++row) {
			for (let col = 0; col < board.size.x; ++col) {
				if (board.ground[row][col] === SPRITES.HEXES.exit) continue;
				if (board.ground[row][col] === null) continue;
				//only filled ground which isn't an exit
				for (let dir = 0; dir < 6; ++dir) {
					const n = stepDir({x:col, y:row}, dir);
					if (isExit(n.x, n.y)) {
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
		for (let y = 0; y < board.size.y; ++y) {
			for (let x = 0; x < board.size.x; ++x) {
				let {x:px,y:py} = pixelPos(x, y);

				drawSprite(px,py, SPRITES.HEXES.outlineUL);
			}
		}

		//rocks:
		for (let rock of board.rocks) {
			const px = pixelPos(rock.x, rock.y);
			drawSprite(px.x, px.y, rock.sprite);
		}

		//sables:
		for (let sable of board.sables) {
			if (sable.remain === 0) continue; //don't draw if entirely gone

			let pts = [];
			function addPoint(at, sprite, S) {
				if (typeof(S) === 'undefined') S = 1.0;
				pts.push({x:at.x, y:at.y, sprite:sprite, S});
			}
			for (let i = 0; i < sable.pts.length; ++i) {
				const at = pixelPos(sable.pts[i].x, sable.pts[i].y);
				if (i === 0) {
					addPoint(at, SPRITES.head);
				} else if (i <= sable.bodyLength) {
					const b = i - 1;
					addPoint(lerp(at, pts[pts.length-1], 0.5), SPRITES.body, (b === 0 ? 0.7 : 1.0));
					addPoint(at, SPRITES.body);
				} else {
					const t = i - 1 - sable.bodyLength;
					addPoint(lerp(at, pts[pts.length-1], 0.5), SPRITES.tail, (t === 0 ? 0.7 : 1.0));
					addPoint(at, SPRITES.tail);
				}
			}

			/*

			if (sable.step) {
				const next = pixelPos(sable.step.x, sable.step.y);
				pts.unshift(lerp(pts[0], next, 0.5));
				pts.unshift(next);
				for (let i = pts.length-1; i >= 2; --i) {
					let a = {x: pts[i].x, y:pts[i].y};
					let b = {x: pts[i-1].x, y:pts[i-1].y};
					let c = {x: pts[i-2].x, y:pts[i-2].y};
					pts[i].x = step*step * c.x + 2.0*(1-step)*step * b.x + (1-step)*(1-step) * a.x;
					pts[i].y = step*step * c.y + 2.0*(1-step)*step * b.y + (1-step)*(1-step) * a.y;
				}
				pts.shift();
				pts.shift();
			} else if (sable.wouldStep) {
				const next = pixelPos(sable.wouldStep.x, sable.wouldStep.y);
				pts.unshift(lerp(pts[0], next, 0.5));
				pts.unshift(next);
				let amt;
				if (step < 0.4) {
					amt = step / 0.4;
				} else {
					amt = 1.0 - (step - 0.4) / 0.6;
				}
				amt *= 0.1;
				for (let i = pts.length-1; i >= 2; --i) {
					let a = {x: pts[i].x, y:pts[i].y};
					let b = {x: pts[i-1].x, y:pts[i-1].y};
					let c = {x: pts[i-2].x, y:pts[i-2].y};
					pts[i].x = amt*amt * c.x + 2.0*(1-amt)*amt * b.x + (1-amt)*(1-amt) * a.x;
					pts[i].y = amt*amt * c.y + 2.0*(1-amt)*amt * b.y + (1-amt)*(1-amt) * a.y;
				}
				pts.shift();
				pts.shift();
			}
			*/

			for (let i = 0; i < pts.length; ++i) {
				if (i == 0) {
					pts[i].d = normalize({
						x:pts[i].x - pts[i+1].x,
						y:pts[i].y - pts[i+1].y
					});
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

			//hides sable after exit:
			//const begin = 2*(1 + sable.body.length + sable.tail.length)-1 - 2 * sable.remain;
			const begin = 0;

			function drawLegs(pt, Y) {
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
				if (i >= begin && pt.sprite.outline) {
					drawSpriteD(pt.sprite.outline, pt.x, pt.y, pt.S * pt.d.x, pt.S * pt.d.y);
				}
			});

			drawLegs(pts[1], 0);
			drawLegs(pts[sable.bodyLength*2], 1);

			for (let i = 1; i < pts.length; i += 2) {
				drawSpriteD(pts[i].sprite, pts[i].x, pts[i].y, pts[i].S * pts[i].d.x, pts[i].S * pts[i].d.y);
			}
			for (let i = pts.length-1; i >= 0; i -= 2) {
				drawSpriteD(pts[i].sprite, pts[i].x, pts[i].y, pts[i].S * pts[i].d.x, pts[i].S * pts[i].d.y);
			}
			/*
			pts.forEach((pt, idx) => {
				if (idx === 0) return;
				drawSpriteD(pt.sprite, pt.x, pt.y, pt.S * pt.d.x, pt.S * pt.d.y);
			});
			*/

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


	//draw mouse:
	if (mouse.grab) {
		const at = pixelPos(mouse.grab.grabbed.x, mouse.grab.grabbed.y);
		drawSprite(at.x, at.y, SPRITES.cursorGrab);
	} else if (mouse.x === mouse.x) {
		drawSprite(mouse.x, mouse.y, SPRITES.cursor);
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
	if (board.tween < 1.0) {
		board.tween = Math.min(1.0, board.tween + elapsed);
	}
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
			if (!('shove' in rock)) continue;
			const key = `${rock.shove.x},${rock.shove.y}`;
			if (key in open) {
				//NOTE: assuming only one action(!)
				open[`${rock.x},${rock.y}`] = true;
				rock.from = {x:rock.x, y:rock.y};
				rock.x = rock.shove.x;
				rock.y = rock.shove.y;
				delete open[key];
			} else {
				console.log("Invalid shove?!");
			}
			delete rock.shove; //remove old action
		}
	}

	{ //(2) sables get pulled:
		//note open tiles (for pulls):
		let open = {};
		//must be a ground tile and *not* an exit:
		for (let y = 0; y < board.size.y; ++y) {
			for (let x = 0; x < board.size.x; ++x) {
				if (board.ground[y][x] !== null && !isExit(x,y)) {
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
			//if sable is getting pulled, and spot behind is open, do the work
			if (!('pull' in sable)) continue;

			if (sable.pts[sable.pts.length-1].exited) {
				console.log("Can't pull entirely exited sable?!");
				delete sable.pull;
				continue;
			}

			const dir = getDir(sable.pts[sable.pts.length-2], sable.pts[sable.pts.length-1]);
			const next = stepDir(sable.pts[sable.pts.length-1], dir);

			const key = `${next.x},${next.y}`;
			if (key in open) {
				delete open[key];

				sable.from = sable.pts;
				sable.pts.shift();
				sable.pts.push(next);

				//NOTE: if trying to resolve multiple pulls, this isn't going to quite work right.

				//remove the most recent exit flag:
				for (let i = sable.pts.length; i >= 0; --i) {
					if (sable.pts[i].exited) {
						sable.pts[i] = {
							x:sable.pts[i].x,
							y:sable.pts[i].y
						};
					}
				}
			} else {
				console.log("Can't pull into full space!");
				delete sable.pull;
				continue;
			}

			//decay to held sable: (or maybe leave on 'pull' so 'from' doesn't get reset?)
			delete sable.pull;
			sable.hold = true;
		}
	}


	{ //(3) sables bark, bite, or step:

		//clear existing barks, bites, steps:
		for (let sable of board.sables) {
			delete sable.next;
			delete sable.barking;
			delete sable.biting;
			delete sable.bitten;
		}

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
				if (isExit(x,y)) {
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
			delete sable.next;

			//fully exited sables don't move:
			if (sable.pts[sable.pts.length-1].exited) {
				continue;
			}
			//held sables don't move:
			if (sable.held) {
				delete sable.held;
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
			if (!('next' in sable)) continue; //no bite if no facing / held
			if (sable.pts[0].exited) continue; //no bite if head has exited
			if (isExit(sable.next.x, sable.next.y)) continue; //no bite at exit
			const key = `${sable.next.x},${sable.next.y}`;
			if (key in tails) {
				const target = tails[key];
				target.bitten = true;
				sable.biting = true;
			} else {
				//only bark if not biting:
				if (!(key in nexts)) nexts[key] = [];
				nexts[key].push(sable);
			}
		}

		//check for resolve barks:
		for (let key in nexts) {
			const list = nexts[key];
			if (list.length <= 1) continue;
			for (let sable of list) {
				sable.barking = true;
			}
		}

		//anything that isn't barking or biting, go to next:
		for (let sable of board.sables) {
			if (!('next' in sable)) continue; //no step if no next
			if (sable.bitten || sable.biting || sable.barking) continue; //no step if fussing at others
			sable.from = sable.pts;
			sable.pts.unshift({x:sable.next.x, y:sable.next.y});
			sable.pts.pop();
			for (let i = 0; i < sable.pts.length; ++i) {
				if (isExit(sable.pts[i].x, sable.pts[i].y)) {
					if (!sable.pts[i].exited) {
						sable.pts[i] = {
							x:sable.pts[i].x,
							y:sable.pts[i].y,
							exited:true
						};
					}
				}
			}
			delete sable.next;
		}
	}
}

function isExit(col, row) {
	if (col < 0 || col >= board.size.x || row < 0 || row >= board.size.y) return true;
	return board.ground[row][col] === SPRITES.HEXES.exit;
}

//step step positions for all sables (grabbed sables don't step)
function setBoardActions(board) {
	//basic idea:
	// all sables that aren't grabbed set their step:
	//  - if there is a straight, set to straight
	//  - else, if there is a short left, set to short left
	//  - else, if there is a long left, set to long left
	//  - else, if there is a short right, set to short right
	//  - else, if there is a long right, set to long right
	// i.e.:
	//    . 2 1
	//   * - o 0
	//    . 4 3
	// any sables stepping to a tile also being stepped to by other sables bark
	
	// any sable stepping to a tile occupied by a sable's tail instead bite
	// any sable bitten, barking, or grabbed does not move

	// (bitten sables contest tiles, while grabbed sables do not)
	// (notice that grabbed sables cannot bite)

	//grabbed sables can be dragged backward (tail direction)
	// into any hex no sable is stepping into
	// (as long as grabbed sable isn't bitten)

	//clear existing steps, bites:
	for (let sable of board.sables) {
		delete sable.step;
		delete sable.bite;
		delete sable.bark;
		delete sable.bitten;
	}

	//note open tiles:
	let open = {};
	for (let y = 0; y < board.size.y; ++y) {
		for (let x = 0; x < board.size.x; ++x) {
			if (board.ground[y][x] !== null) {
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
		//TODO: DEAL WITH 'REMAIN' HERE!
		delete open[`${sable.head.x},${sable.head.y}`];
		for (let i = 0; i < sable.body.length; ++i) {
			delete open[`${sable.body[i].x},${sable.body[i].y}`];
		}
		//NOTE: consider making last segment of body open if sable is moving and doesn't have a tail
	}

	//lazy way of adding exits as open:
	for (let y = -1; y <= board.size.y; ++y) {
		for (let x = -1; x <= board.size.x; ++x) {
			if (isExit(x,y)) {
				open[`${x},${y}`] = true;
			}
		}
	}


	//compute steps:
	for (let sable of board.sables) {
		if (sable.remain === 0) continue; //no step -- it's all gone

		const dir = getDir(sable.body[0], sable.head);
		if (sable.remain < 1 + sable.body.length + sable.tail.length) {
			//already exiting
			sable.step = stepDir(sable.head, dir);
		} else {
			//need to steer
			[0,1,2,5,4].some((ofs) => {
				const next = stepDir(sable.head, (dir+ofs)%6);
				if (`${next.x},${next.y}` in open) {
					sable.step = next;
					return true;
				} else {
					return false;
				}
			});
		}

		if (sable.step) {
			sable.wouldStep = sable.step;
		} else {
			sable.wouldStep = stepDir(sable.head, dir);
		}

		//grabbed sables don't step:
		if (sable.grabbed) {
			delete sable.step;
		}
	}

	//check for barks:
	let steps = {};
	for (let sable of board.sables) {
		if (sable.remain < 1 + sable.body.length + sable.tail.length) continue; //no bark if exiting
		if (sable.step) {
			if (isExit(sable.step.x, sable.step.y)) continue; //no bark at exit
			const key = `${sable.step.x},${sable.step.y}`;
			if (!(key in steps)) steps[key] = [];
			steps[key].push(sable);
		}
	}
	for (let key in steps) {
		const list = steps[key];
		if (list.length <= 1) continue;
		for (let sable of list) {
			sable.bark = sable.step;
			delete sable.step;
		}
	}

	//check for bites:
	let tails = {};
	for (let sable of board.sables) {
		const first = Math.max(0, sable.tail.length - sable.remain); //don't check tail that has exited
		for (let i = first; i < sable.tail.length; ++i) {
			const key = `${sable.tail[i].x},${sable.tail[i].y}`;
			console.assert(!(key in tails),"tails should not overlap");
			tails[key] = sable;
		}
	}
	for (let sable of board.sables) {
		if (sable.remain < 1 + sable.body.length + sable.tail.length) continue; //no bite if exiting
		if (sable.step) {
			if (isExit(sable.step.x, sable.step.y)) continue; //no bite at exit
			const key = `${sable.step.x},${sable.step.y}`;
			if (key in tails) {
				const target = tails[key];
				target.bitten = target.step;
				sable.bite = sable.step;
				delete sable.step;
			}
		}
	}
	for (let sable of board.sables) {
		if ('bitten' in sable) delete sable.step;
	}

}

function execute() {
	stepBoard(board);
}
function undo() {
	//TODO
}
function reset() {
	//TODO
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
		if (board) {
			setMouseHex();
			if ('hx' in mouse) {
				let didGrab = false;
				for (let sable of board.sables) {
					for (let i = 0; i < sable.tail.length; ++i) {
						let pos;
						if (step > 0.5 && 'step' in sable) {
							pos = (i === 0 ? sable.body[sable.body.length-1] : sable.tail[i-1]);
						} else {
							pos = sable.tail[i];
						}
						if (pos.x === mouse.hx && pos.y === mouse.hy) {
							sable.grabbed = {x:mouse.hx, y:mouse.hy};
							mouse.grab = sable;
							didGrab = true;
						}
					}
				}
				if (didGrab) {
					if (step < 0.5) {
						setSteps(board);
					}
				}
				if (!didGrab) {
					for (let rock of board.rocks) {
						if (rock.x === mouse.hx && rock.y === mouse.hy) {
							mouse.rock = rock;
						}
					}
				}
			}
		}
	}

	function handleUp() {
		if ('grab' in mouse) {
			delete mouse.grab.grabbed;
			delete mouse.grab;
			if (step < 0.5) {
				setSteps(board);
			}
		}
		if ('rock' in mouse) {
			delete mouse.rock;
		}
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
