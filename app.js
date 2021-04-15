const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
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

const routes = loadActivityRoutes(config["athlete_id"]);

const roadMaxDistFeet = 1500;
const roadPercentExplored = 0.75;
const roadFeetExploreRange = 50;
const lat_padding = (roadFeetExploreRange * 2.0) / 364000.0;
const long_padding = (roadFeetExploreRange * 2.0) / 288200.0;

const home = routes[0][0].data[0];
const global_bounds_min = [];
const routePoints = routes
	.map(r => r[0].data)
	.flat();
	// .filter(p => isInBounds(p, global_bounds_min, global_bounds_max));

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

// loads the activities for the given athlete 
function loadActivityRoutes(athlete_id) {
	var activities_list = cacheGet(`strava_athlete_${athlete_id}_activities`);
	return activities_list.map(activity_info => cacheGet(`strava_activity_${activity_info.id}`));
}

// get the nearby roads
function getNearbyRoads(lat, lon) {
	var cache_name = `overpass_nearby_roads_${roadMaxDistFeet}_${lat}_${lon}`;

	// var data = cacheGet(cache_name);
	// if (data) {
	// 	return Promise.resolve(data);
	// }

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
						return road.properties.tags.bicycle == "yes";
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
				console.log(`${roads.length} roads`);
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

// requesting roads around this point
app.use("/road/:lat/:lon", (req, res) => {
	const lat = parseFloat(req.params.lat),
		lon = parseFloat(req.params.lon);

	getNearbyRoads(lat, lon).then(roads => {
		console.log("filtering...");
		roads.forEach(flagRoadIfVisited);
		console.log("filtered!");
		return res.json(roads);
	}).catch(err => {
		console.error(err)
		return res.status(err.statusCode).json(err);
	});
});

// requesting the route
app.use("/routes", (req, res) => {
	return res.json(routes)
});

// basic html return
app.use("/", (req, res) => {
	res.render("index", { baseUrl: req.baseUrl });
});

// error handler
app.use(function (err, req, res, next) {
	console.log(err);
	res.json(err);
});

module.exports = app;

console.log("] started!");