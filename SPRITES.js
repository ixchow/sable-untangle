"use strict";

const SPRITES_IMG = new Image();
SPRITES_IMG.onload = function(){
	console.log("sprites loaded.");
};
SPRITES_IMG.src = "sketches.png";

//relative to origin-upper-left assets image:
const SPRITES = {
	HEXES:{
		outline:{x:1, y:1, w:23, h:26, ax:12, ay:13},
		outlineUL:{x:1, y:1, w:22, h:19, ax:12, ay:13},
		outlineLR:{x:2, y:7, w:22, h:20, ax:12, ay:13},
		dirt:{x:25, y:1, w:22, h:25, ax:36, ay:13},
		dirt2:{x:48, y:1, w:22, h:25, ax:59, ay:13},
		grass:{x:71, y:1, w:22, h:25, ax:82, ay:13},

		exit:{x:143, y:0, w:23, h:26, ax:154, ay:12},
	},
	head:{x:48, y:45, w:18, h:22, ax:55, ay:56},
	//body:{x:24, y:49, w:20, h:16, ax:34, ay:56},

	headBark:{x:68,y:26,w:17,h:20,ax:70, ay:36},
	headBite:{x:71,y:47,w:15,h:20,ax:66, ay:56}, //79 is too far right.
	headJaw:{x:87,y:53,w:7,h:5,ax:87, ay:56},

	bark:{x:89,y:26,w:13,h:19,ax:95,ay:35},

	body:{x:27, y:72, w:16, h:16, ax:34, ay:79},
	bodyOutline:{x:48, y:71, w:18, h:18, ax:56, ay:79},
	tail:{x:2, y:49, w:19, h:17, ax:12, ay:56},
	paw:{x:43, y:36, w:5, h:4, ax:43, ay:38},
	leg:{x:31, y:35, w:10, h:7, ax:33, ay:40},
	cursorGrab:{x:143, y:44, w:18, h:20, ax:151, ay:53},
	cursor:{x:164, y:40, w:23, h:24, ax:174, ay:53},
	cursorClick:{x:192, y:41, w:20, h:24, ax:203, ay:44},

	arrowHoriz:{x:148, y:27, w:10, h:8, ax:152, ay:30},
	arrowDiag:{x:167, y:26, w:7, h:8, ax:169, ay:30},
	

	rock:{x:145, y:75, w:21, h:20, ax:155, ay:84},
	rockSpot:{x:170, y:77, w:13, h:14, ax:176, ay:83},
	rockHoriz:{x:165, y:99, w:23, h:11, ax:175, ay:104},
	rockDiag:{x:186, y:77, w:19, h:22, ax:195, ay:87},

	shine:{x:94, y:1, w:23, h:26, ax:105, ay:13},
	shineDiag:{x:119, y:1, w:23, h:26, ax:130, ay:13},

	BUTTONS:{
		step:{x:0,y:356,w:60,h:20,ax:28,ay:375},
		undo:{x:70,y:356,w:67,h:20,ax:136,ay:375},
		reset:{x:140,y:356,w:63,h:20,ax:140,ay:375},
		prev:{x:221,y:324,w:55,h:20,ax:221,ay:324},
		next:{x:292,y:324,w:55,h:20,ax:346,ay:324},
	},
};

SPRITES.body.outline = SPRITES.bodyOutline;
