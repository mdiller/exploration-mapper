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
let videoPoints = [];


console.log("test");

(async() => {
	await startup();
})();
console.log("test2");

async function startup() {
	console.log("test1");

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
	videoPoints = videoInfos.map(v => v.data).reduce((a, b) => a.concat(b));

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
	var point = [ e.latlng.lat, e.latlng.lng ];
	streetViewImg.src = `${baseUrl}streetview/${point[0]}/${point[1]}`
	if (streetViewContainer.classList.contains(streetViewHideWord)) {
		streetViewContainer.classList.remove(streetViewHideWord);
	}
});

streetViewClose.onclick = function () {
	if (!streetViewContainer.classList.contains(streetViewHideWord)) {
		streetViewContainer.classList.add(streetViewHideWord);
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