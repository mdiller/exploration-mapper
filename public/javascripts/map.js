// set up leaflet map on a page
let osmUrl = "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
let osmAttrib = "Map data © <a href=\"http://openstreetmap.org\">OpenStreetMap</a> contributors";
let osmLayer = new L.TileLayer(osmUrl, {minZoom: 3, maxZoom: 19, attribution: osmAttrib});

let mapparino = new L.Map("map");
mapparino.addLayer(osmLayer);

let roads = {};
let body = document.getElementsByTagName("body")[0];

// on startup, draw my route
body.classList.add("is-loading");
fetch(baseUrl + "route")
	.then((response) => response.json())
	.then((json) => {
		var home = json[0].data[0];
		mapparino.setView(new L.LatLng(home[0], home[1]), 15);
		drawRoute(json);

		// now get the data from around the starting point of this route
		fetch(baseUrl + "road/" + home[0] + "/" + home[1])
			.then((response) => response.json())
			.then((json) => {
				json.map(highlightRoad)
				body.classList.remove("is-loading");
			});
	});

// highlight the given road
function highlightRoad(road) {
	if (!road.id.includes("way")) {
		return; // only draw ways
	}
	if (!road.visited) {
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

	let points = road.geometry.coordinates;
	let roadLine = L.polyline(points, {
			weight: 10,
			color: "#6080ff",
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
}

function drawRoute(route) {
	let points = route[0].data;
	let roadLine = L.polyline(points, {
		weight: 10,
		color: "#ee0000",
		opacity: 1
	});

	roadLine.addTo(mapparino);
}

function deselectRoad(roadId) {
	roads[roadId].remove();
	delete roads[roadId];
}