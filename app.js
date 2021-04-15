const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use("/libs", express.static(path.join(__dirname, "node_modules")));
const overpass = require("query-overpass");

const routes = [
	JSON.parse(fs.readFileSync("cache/example_route.json"))
];

const route = routes[0];

const roadMaxDist = 1500;
const roadPercentExplored = 0.75;
const roadFeetExploreRange = 50;
const lat_padding = (roadFeetExploreRange * 2.0) / 364000.0;
const long_padding = (roadFeetExploreRange * 2.0) / 288200.0;


// get the nearby roads
function getNearbyRoads(lat, lon) {
	const query = `[out:json];
			way
			(around:${roadMaxDist},${lat},${lon})
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
				return reject({statusCode: 404, message: "No roads found around given point"});
			} else {
				var roads = roads.features.filter(road => {
					if (!road.id.includes("way")) {
						return false;
					}
					if (road.geometry.type != "LineString") {
						return false;
					}
					return true;
				});
				roads.forEach(road => {
					road.geometry.coordinates = road.geometry.coordinates.map(p => [ p[1], p[0] ]);
				});
				console.log(`${roads.length} roads`);
				// fs.writeFileSync("cache/nearby_roads.json", JSON.stringify(roads));
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

// converts numeric degrees to radians
function toRad(Value) 
{
	return Value * Math.PI / 180;
}

// flags the road as visited if we"ve been to it
function flagRoadIfVisited(road) {
	if (road.geometry.type != "LineString") {
		return;
	}

	var roadpoints = road.geometry.coordinates
	var points = route[0].data;

	var bounds_min = [ Math.min(...roadpoints.map(p => p[0])) - lat_padding, Math.min(...roadpoints.map(p => p[1])) - long_padding ];
	var bounds_max = [ Math.max(...roadpoints.map(p => p[0])) + lat_padding, Math.max(...roadpoints.map(p => p[1])) + long_padding ];

	let count = 0;
	let thresh = road.geometry.coordinates.length * roadPercentExplored;
	for (let i = 0; i < roadpoints.length; i++) {
		let p2 = roadpoints[i]
		for (let j = 0; j < points.length; j++) {
			let p1 = points[j];
			if (p1[0] > bounds_min[0] && p1[0] < bounds_max[0] && p1[1] > bounds_min[1] && p1[1] < bounds_max[1]) {
				var diff = calcCrow(p1, p2);
				if (diff < roadFeetExploreRange) {
					count++;
					break;
				}
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
		console.log("filtering");
		roads.forEach(flagRoadIfVisited);
		console.log("filtered");
		return res.json(roads);
	}).catch(err => {
		console.error(err)
		return res.status(err.statusCode).json(err);
	});
});

// requesting the route
app.use("/route", (req, res) => {
	return res.json(route)
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
