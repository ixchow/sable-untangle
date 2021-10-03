"use strict";

const SPRITES_IMG = new Image();
SPRITES_IMG.onload = function(){
	console.log("sprites loaded.");
};
SPRITES_IMG.src = "sketches.png";

//relative to origin-upper-left assets image:
const SPRITES = {
	HEXES:{
		outlineUL:{x:1, y:1, w:22, h:19, ax:12, ay:13},
		outlineLR:{x:2, y:7, w:22, h:20, ax:12, ay:13},
		dirt:{x:25, y:1, w:22, h:25, ax:36, ay:13},
		dirt2:{x:48, y:1, w:22, h:25, ax:59, ay:13},
		grass:{x:71, y:1, w:22, h:25, ax:82, ay:13},

		exit:{x:71, y:1, w:22, h:25, ax:82, ay:13},
	},
	head:{x:48, y:45, w:18, h:22, ax:56, ay:56},
	//body:{x:24, y:49, w:20, h:16, ax:34, ay:56},
	body:{x:27, y:72, w:16, h:16, ax:34, ay:79},
	bodyOutline:{x:48, y:71, w:18, h:18, ax:56, ay:79},
	tail:{x:2, y:49, w:19, h:17, ax:12, ay:56},
	paw:{x:43, y:36, w:5, h:4, ax:43, ay:38},
	leg:{x:31, y:35, w:10, h:7, ax:33, ay:40},
	cursorGrab:{x:143, y:44, w:18, h:20, ax:151, ay:53},
	cursor:{x:164, y:40, w:23, h:24, ax:174, ay:53},
	arrowHoriz:{x:148, y:27, w:10, h:8, ax:140, ay:30},
	arowDiag:{x:166, y:26, w:8, h:8, ax:162, ay:38},
	

	rock:{x:145, y:75, w:21, h:20, ax:155, ay:84},
	rockSpot:{x:170, y:77, w:13, h:14, ax:176, ay:83},
	rockHoriz:{x:165, y:99, w:23, h:11, ax:175, ay:104},
	rockDiag:{x:186, y:77, w:19, h:22, ax:195, ay:87},

	shine:{x:94, y:1, w:23, h:26, ax:105, ay:13},
	shineDiag:{x:119, y:1, w:23, h:26, ax:130, ay:13},
};

SPRITES.body.outline = SPRITES.bodyOutline;
