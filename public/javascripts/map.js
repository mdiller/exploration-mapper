// set up leaflet map on a page
let osmUrl = "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
let osmAttrib = "Map data © <a href=\"http://openstreetmap.org\">OpenStreetMap</a> contributors";
let osmLayer = new L.TileLayer(osmUrl, {minZoom: 3, maxZoom: 19, attribution: osmAttrib});

let mapparino = new L.Map("map");
mapparino.addLayer(osmLayer);

let body = document.getElementsByTagName("body")[0];
let roads = [];
let activities = [];
let videoInfos = {};
let streetViewPoints = [];


let streetViewMarker = null;



(async() => {
	await startup();
})();

async function startup() {

	// fetch and draw activities
	body.classList.add("is-loading");
	var response = await fetch(baseUrl + "activities");
	activities = await response.json();

	var home = activities[activities.length - 1].data[0].latlng;
	mapparino.setView(new L.LatLng(home[0], home[1]), 14);
	activities.forEach(drawActivity);


	// fetch and draw video paths
	body.classList.add("is-loading");
	response = await fetch(baseUrl + "videoinfos");
	videoInfos = await response.json();
	streetViewPoints = Object.keys(videoInfos).map(key => videoInfos[key].data).reduce((a, b) => a.concat(b));

	Object.keys(videoInfos).forEach(key => {
		drawVideoPath(videoInfos[key]);
	});


	// fetch and draw roads
	response = await fetch(baseUrl + "road/" + home[0] + "/" + home[1]);
	roads = await response.json();

	roads.forEach(highlightRoad);


	body.classList.remove("is-loading");
	console.log("done!");
}



// highlight the given road
function highlightRoad(road) {
	if (!road.id.includes("way")) {
		return; // only draw ways
	}
	if (road.visited) {
		return; // only draw visited roads
	}
	if (!road || !road.id) {
		// error while querying road
		console.log(road);

		if (road.message) {
			alert(road.message);
		}

		return;
	}

	if (roads[road.id]) {
		return;
	}

	let roadColor = "#ee0000";

	let points = road.geometry.coordinates;
	let roadLine = L.polyline(points, {
			weight: 10,
			color: roadColor,
			opacity: 0.5
		});
	let roadDescription = `<strong>${road.properties.tags.name || "Unknown road"}</strong><br/>
								<pre>${JSON.stringify(road.properties, null, 2)}</pre>`;

	roadLine
		.bindTooltip(roadDescription, {
			sticky: true
		})
		.addTo(mapparino);



	roadLine.addTo(mapparino);

	roads[road.id] = roadLine;

	// when road is clicked again, deselect it
	roadLine.on("click", function (e) {
		L.DomEvent.stop(e);
		deselectRoad(road.id);
	});
	roadLine.on("mouseover", function(e) {
		this.setStyle({
			color: "green"
		});
	});
	roadLine.on("mouseout", function(e) {
		this.setStyle({
			color: roadColor
		});
	});
}


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
function toRad(Value) {
	return Value * Math.PI / 180;
}

// location found stuff

// mapparino.on("locationfound", function (e) {
// 	L.marker(e.latlng)
// 		.bindTooltip("you are here", { sticky: true })
// 		.addTo(mapparino);
// });

// mapparino.on("locationerror", function (e) {
// 	alert(e.message);
// });

// mapparino.locate({setView: true, maxZoom: 16});

var streetViewHideWord = "hide";
var streetViewContainer = document.getElementById("streetview");
var streetViewImg = document.getElementById("streetviewimg");
var streetViewClose = document.getElementById("streetviewclose");
mapparino.on("click", function (e) {
	var pointClicked = [ e.latlng.lat, e.latlng.lng ];

	if (streetViewPoints.length == 0) {
		// no video data available, so do nothing
		return;
	}

	// find closest point
	var bestPoint = null;
	var bestPointScore = Infinity;
	for (var i = 0; i < streetViewPoints.length; i++) {
		var score = calcCrow(streetViewPoints[i].latlng, pointClicked);
		if (score < bestPointScore) {
			bestPoint = streetViewPoints[i];
			bestPointScore = score;
		}
	}
	var videoInfo = videoInfos[bestPoint.video];
	var secondsIn = bestPoint.seconds_in;

	// update marker
	if (streetViewMarker == null) {
		streetViewMarker = L.marker(bestPoint.latlng).addTo(mapparino);
	}
	else {
		streetViewMarker.setLatLng(bestPoint.latlng);
	}


	// update image url
	streetViewImg.src = `${baseUrl}streetview/${videoInfo.name}/${secondsIn}`;
	if (streetViewContainer.classList.contains(streetViewHideWord)) {
		streetViewContainer.classList.remove(streetViewHideWord);
	}
});

streetViewClose.onclick = function () {
	if (!streetViewContainer.classList.contains(streetViewHideWord)) {
		streetViewContainer.classList.add(streetViewHideWord);
	}
	if (streetViewMarker != null) {
		mapparino.removeLayer(streetViewMarker);
		streetViewMarker = null;
	}
};


function drawActivity(route) {
	let points = route.data.map(d => d.latlng);
	let roadLine = L.polyline(points, {
		weight: 5,
		color: "#0000ee",
		opacity: 0.75
	});

	roadLine.addTo(mapparino);
}

function drawVideoPath(videoInfo) {
	let points = videoInfo.data.map(d => d.latlng);
	let roadLine = L.polyline(points, {
		weight: 5,
		color: "#00eeee",
		opacity: 0.75
	});

	roadLine.addTo(mapparino);
}

function deselectRoad(roadId) {
	roads[roadId].remove();
	delete roads[roadId];
}