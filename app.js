const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const ffmpeg = require("fluent-ffmpeg");
const strava = require("strava-v3");
const util = require("util")
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use("/libs", express.static(path.join(__dirname, "node_modules")));
const overpass = require("query-overpass");

var config = JSON.parse(fs.readFileSync("config.json"));

var cache_dir = __dirname + "/cache";
if (!fs.existsSync(cache_dir)) {
	fs.mkdirSync(cache_dir);
	console.log("] created cache dir");
}

// promisified fs stuff
const fs_readdir = util.promisify(fs.readdir);


const activities = [];

const roadMaxDistFeet = 1500;
const roadPercentExplored = 0.75;
const roadFeetExploreRange = 50;
const lat_padding = (roadFeetExploreRange * 2.0) / 364000.0;
const long_padding = (roadFeetExploreRange * 2.0) / 288200.0;

const global_bounds_min = [];
var routePoints = []

var videoDir = config.video_dir;
if (videoDir == undefined) {
	videoDir = "./cache/videos"
}
const videoInfos = {};

var streetViewPoints = [];

var strava_needs_token = false;


(async() => {
	await startup();
})();

async function startup() {
	console.log("] starting up...");

	var strava_access_token = await getStravaAccessToken();
	if (strava_access_token == null) {
		strava_needs_token = true;
		// we need a new token to continue, so lets just exit here, and delay startup until later
		return;
	}
	strava_needs_token = false;

	await loadStravaStuff(strava_access_token);

	// load all latlng points from routes
	routePoints = activities
	.map(r => r.data.map(p => p.latlng))
	.flat();


	await loadVideoInfos(videoDir);

	console.log("] done!");
}

// gets the strava access token
async function getStravaAccessToken(code) {
	var cache_name = "strava_tokens";
	var strava_tokens = cacheGet("strava_tokens");
	strava.config({
		"client_id": config.strava_api.client_id,
		"client_secret": config.strava_api.client_secret
	});

	if (strava_tokens != null) {
		if (strava_tokens.expires_at > (Date.now() / 1000)) {
			// using existing token, as it hasn't expired
			return strava_tokens.access_token;
		}
		else {
			// refreshing an existing (expired) token
			strava_tokens = await strava.oauth.refreshToken(strava_tokens.refresh_token);
		}
	}
	else {
		// generating a new token
		try {
			strava_tokens = await strava.oauth.getToken(code);
		}
		catch (err) {
			if (err.statusCode == 400) {
				// wait for a user to try to connect, then prompt them to authorize so i can get access token
				console.log("] need strava access token to continue, connect to server to get prompted");
				strava_needs_token = true;
				return null;
			}
			else {
				console.error(err);
				process.exit(1);
			}
		}
	}
	// save the new token data
	cachePut(cache_name, strava_tokens);

	return strava_tokens.access_token;
}

// loads the strava stuff
async function loadStravaStuff(access_token) {
	console.log("] retrieving activities...");
	const activity_infos = await strava.athlete.listActivities({ 
		access_token: access_token,
		per_page: 200
	});
	cachePut("strava_athlete_activities", activities);

	for (const activity_info of activity_infos) {
		var activity_cache_name = `strava_activity_${activity_info.id}`;
		var activity_data = cacheGet(activity_cache_name);

		if (activity_data == null) {
			console.log(`] retrieving activity ${activity_info.id} data...`);
			activity_data = await strava.streams.activity({
				access_token: access_token,
				id: activity_info.id,
				types: "latlng,time"
			});
			cachePut(activity_cache_name, activity_data);
		}
		else {
			console.log(`] activity ${activity_info.id} retrieved from cache`);
		}
		var data = [];

		for (let i = 0; i < activity_data[0].original_size; i++) {
			var point = {};
			for (const part of activity_data) {
				point[part.type] = part.data[i];
			}
			data.push(point);
		}

		activity_info.data = data;

		// pushing to global variable
		activities.push(activity_info);
	}

	console.log("] strava loaded!")
}


Date.prototype.addHours = function(h) {
	this.setTime(this.getTime() + (h*60*60*1000));
	return this;
}
Date.prototype.addSeconds = function(s) {
	this.setTime(this.getTime() + (s*1000));
	return this;
}

// loads all the video info into memory
async function loadVideoInfos(video_dir) {
	console.log("] loading videos...");
	if (!fs.existsSync(video_dir)) {
		console.log("] video_dir file doesn't exist, skipping this loading");
		return;
	}
	var files = await fs_readdir(video_dir);

	for (const file of files) {
		if (!(file.endsWith("MP4") || file.endsWith("mp4"))) {
			continue; // skip things that arent videos
		}
		console.log(`] loading ${file}`);
		var filepath = path.join(video_dir, file);
		var ffprobe_data = await (new Promise((resolve, reject) => {
			ffmpeg(filepath)
			.ffprobe(0, function(err, data) {
				if (err) {
					reject(err);
				}
				else {
					resolve(data);
				}
			});
		}));
		var startDate = new Date(ffprobe_data.format.tags.creation_time);
		startDate = startDate.addHours(7); // adjust for weird 7 hour offset (is flagged as UTC when it isnt)
		var name = path.basename(filepath).split(".").slice(0, -1).join(".");
		var info = {
			file: filepath,
			name: name,
			start: startDate.toISOString(),
			duration: ffprobe_data.format.duration,
			data: []
		}
		videoInfos[name] = info;
		loadStreetViewPoints(info);
	}

	console.log("] videos loaded!");
}

// adds all streetview points that are recorded during this video
function loadStreetViewPoints(video_info) {
	var start = new Date(video_info.start);
	var end = new Date(video_info.start).addSeconds(video_info.duration);
	let newPoints = activities.filter(activity => {
		var aStart = new Date(activity.start_date);
		var aEnd = new Date(activity.start_date).addSeconds(activity.elapsed_time);
		return aStart < start && aEnd > end;
	}).map(activity => {
		var result = [];
		for(var i = 0; i < activity.data.length; i++) {
			var time = new Date(activity.start_date).addSeconds(activity.data[i].time);
			result.push({
				latlng: activity.data[i].latlng,
				time: time.toISOString()
			});
		}
		return result;
	}).flat()
	.filter(point => {
		var date = new Date(point.time);
		return date > start && date < end;
	})
	.map(point => {
		point.video = video_info.name;
		point.seconds_in = ((new Date(point.time).getTime()) - start) / 1000;
		video_info.data.push(point);
		return point;
	});
	streetViewPoints = streetViewPoints.concat(newPoints);
}

// gets the filename for the cache
function cacheGetFilename(name) {
	name = name.replace(/[^a-zA-Z_0-9.]/g, "");
	var filename = cache_dir + "/" + name + ".json"
	return filename;
}

// puts json data in the cache
function cachePut(name, data) {
	var filename = cacheGetFilename(name);
	fs.writeFileSync(filename, JSON.stringify(data, null, "\t"));
}

// gets json data from cache if the name exists.
function cacheGet(name) {
	var filename = cacheGetFilename(name);
	if (fs.existsSync(filename)) {
		return JSON.parse(fs.readFileSync(filename))
	}
	else {
		return null;
	}
}

// get the nearby roads
function getNearbyRoads(lat, lon) {
	var cache_name = `overpass_nearby_roads_${roadMaxDistFeet}_${lat}_${lon}`;

	var data = cacheGet(cache_name);
	if (data) {
		return Promise.resolve(data);
	}

	console.log("retrieving overpass data for nearby roads...");
	const query = `[out:json];
			way
			(around:${roadMaxDistFeet},${lat},${lon})
			["highway"];
		(
			._;
			>;
		);
		out;`;

	return new Promise((resolve, reject) => {
		overpass(query, (error, roads) => {
			if (error) {
				return reject(error);
			} else if (roads.features.length < 1) {
				return reject({ statusCode: 404, message: "No roads found around given point" });
			} else {
				var roads = roads.features.filter(road => {
					// filter out stuff that isnt a way line
					if (!road.id.includes("way")) {
						return false;
					}
					if (road.geometry.type != "LineString") {
						return false;
					}
					if (road.properties.tags.surface == "ground") {
						return false;
					}
					if (road.properties.tags.access == "private") {
						return false;
					}
					if (road.properties.tags.indoor) {
						return false;
					}
					if (["proposed", "service", "steps"].includes(road.properties.tags.highway)) {
						return false;
					}
					if (road.properties.tags.bicycle) {
						return ["yes", "designated"].includes(road.properties.tags.bicycle);
					}
					if (road.properties.tags.highway == "footway") {
						if (road.properties.tags.footway == "sidewalk") {
							return false;
						}
						if (road.properties.tags.surface != "paved") {
							return false;
						}
					}
					return true;
				});
				roads.forEach(road => {
					// coords are in wrong order. put em in lat, lon
					road.geometry.coordinates = road.geometry.coordinates.map(p => [ p[1], p[0] ]);
				});
				console.log(`${roads.length} roads retrieved`);
				cachePut(cache_name, roads);
				return resolve(roads);
			}
		});
	});
};

// distance as a crow files between 2 points in feet
// Taken directly from https://stackoverflow.com/questions/18883601
function calcCrow(p1, p2) 
{
	var lat1 = p1[0];
	var lat2 = p2[0];
	var lon1 = p1[1];
	var lon2 = p2[1];

	var R = 6371; // km
	var dLat = toRad(lat2 - lat1);
	var dLon = toRad(lon2 - lon1);
	var lat1 = toRad(lat1);
	var lat2 = toRad(lat2);

	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2); 
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
	var d = R * c;
	return d * 3280.84; // convert to feet
}

// determines whether the given point p is in a box contained by the two bounding points
// the bounding points should be: min is in top left (min values), max is in bottom right (max values)
function isInBounds(p, bounds_min, bounds_max) {
	return p[0] > bounds_min[0] && p[0] < bounds_max[0] && p[1] > bounds_min[1] && p[1] < bounds_max[1]
}

// converts numeric degrees to radians
function toRad(Value) {
	return Value * Math.PI / 180;
}

// flags the road as visited if we"ve been to it
function flagRoadIfVisited(road) {
	if (road.geometry.type != "LineString") {
		return;
	}

	var roadpoints = road.geometry.coordinates

	var bounds_min = [ Math.min(...roadpoints.map(p => p[0])) - lat_padding, Math.min(...roadpoints.map(p => p[1])) - long_padding ];
	var bounds_max = [ Math.max(...roadpoints.map(p => p[0])) + lat_padding, Math.max(...roadpoints.map(p => p[1])) + long_padding ];

	var points = routePoints.filter(p => isInBounds(p, bounds_min, bounds_max));

	let count = 0;
	let thresh = road.geometry.coordinates.length * roadPercentExplored;
	for (let i = 0; i < roadpoints.length; i++) {
		let p2 = roadpoints[i]
		for (let j = 0; j < points.length; j++) {
			let p1 = points[j];
			var diff = calcCrow(p1, p2);
			if (diff < roadFeetExploreRange) {
				count++;
				break;
			}
		}

		if (count > thresh) {
			road.visited = true;
			break;
		}
	}
}

async function extractFrame(video, seconds_in, filename) {
	return new Promise((resolve,reject)=> {
		ffmpeg(video)
			.setStartTime(seconds_in)
			.outputOptions("-vframes 1")
			.saveToFile(filename)
			.on("end", () => {
				resolve();
		})
			.on("error",(err)=>{
			return reject(new Error(err))
		})
	});
}

// requesting roads around this point
app.use("/road/:lat/:lon", (req, res) => {
	const lat = parseFloat(req.params.lat),
		lon = parseFloat(req.params.lon);

	getNearbyRoads(lat, lon).then(roads => {
		roads.forEach(flagRoadIfVisited);
		return res.json(roads);
	}).catch(err => {
		console.error(err)
		return res.status(err.statusCode).json(err);
	});
});

// requesting video information
app.use("/videoinfos", (req, res) => {
	return res.json(videoInfos);
});

// requesting the activities
app.use("/activities", (req, res) => {
	return res.json(activities);
});

// return closest streetview image i can find to this location
app.get("/streetview/:lat/:lon", async (req, res) => {
	var target = [ parseFloat(req.params.lat), parseFloat(req.params.lon) ];

	if (streetViewPoints.length == 0) {
		res.status(404).json({
			"message": "no video data available"
		});
		return;
	}

	var bestPoint = null;
	var bestPointScore = Infinity;
	for (var i = 0; i < streetViewPoints.length; i++) {
		var score = calcCrow(streetViewPoints[i].latlng, target);
		if (score < bestPointScore) {
			bestPoint = streetViewPoints[i];
			bestPointScore = score;
		}
	}
	var videoFile = bestPoint.video;
	var secondsIn = bestPoint.seconds_in;

	var filename = "./cache/temp.jpg";
	try {
		await extractFrame(videoFile, secondsIn, filename);
		res.sendFile(path.resolve(filename));
	}
	catch (err) {
		console.error(err);
		res.status(500).json(err);
	}
});

app.use("/strava_token_authentication", async (req, res) => {
	await getStravaAccessToken(req.query.code);

	// now we can do a full startup because we have a valid token
	await startup();

	res.redirect(req.protocol + "://" + req.get("host"));
});

// basic html return
app.use("/", (req, res) => {
	if (strava_needs_token) {
		var redirect_uri = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + "strava_token_authentication";
		var strava_auth_url = `http://www.strava.com/oauth/authorize?client_id=${config.strava_api.client_id}&response_type=code&redirect_uri=${redirect_uri}&approval_prompt=force&scope=profile:read_all,activity:read_all`
		res.redirect(strava_auth_url);
		return;
	}

	res.render("index", { baseUrl: req.baseUrl });
});

// error handler
app.use(function (err, req, res, next) {
	console.log(err);
	res.json(err);
});


module.exports = app;